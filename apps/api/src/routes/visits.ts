import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  VisitCreate,
  VisitStatusUpdate,
  VisitId,
  VisitQueueQuery,
  FollowUpUpsert,
  FollowUpStatusUpdate,
  UserId,
  XrayId,
  XrayContentType,
  RxLine,
  BillingCheckoutInput,
} from '@dms/types';
import { v4 as randomUUID } from 'uuid';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import {
  visitRepository,
  InvalidStatusTransitionError,
  DoctorBusyError,
} from '../repositories/visitRepository';
import { followupRepository, FollowUpRuleViolationError } from '../repositories/followupRepository';
import { xrayRepository, XrayConflictError } from '../repositories/xrayRepository';
import { prescriptionRepository } from '../repositories/prescriptionRepository';
import { buildXrayObjectKey } from './xray';
import { s3Client } from '../config/aws';
import { XRAY_BUCKET_NAME } from '../config/env';
import { requireRole } from '../middlewares/auth';
import { patientRepository } from '../repositories/patientRepository';
import {
  billingRepository,
  BillingRuleViolationError,
  DuplicateCheckoutError,
  VisitNotDoneError,
} from '../repositories/billingRepository';
import { logAudit, logError } from '../lib/logger';
import { sendZodValidationError } from '../lib/validation';
import { generateXrayThumbnail } from '../services/xrayThumbnails';
import { publishDoctorQueueUpdated } from '../realtime/publisher';

const router = express.Router();

const handleValidationError = (req: Request, res: Response, issues: z.ZodError['issues']) => {
  return sendZodValidationError(req, res, issues);
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 100): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastError;
}

export class PrescriptionStorageError extends Error {
  readonly code = 'RX_UPLOAD_FAILED' as const;
  readonly statusCode = 503 as const;

  constructor(message = 'Unable to store prescription JSON, please retry.') {
    super(message);
    this.name = 'PrescriptionStorageError';
  }
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = VisitCreate.safeParse(req.body);
    if (!parsed.success) {
      return handleValidationError(req, res, parsed.error.issues);
    }

    const visit = await visitRepository.create(parsed.data);

    void publishDoctorQueueUpdated({
      doctorId: visit.doctorId,
      visitDate: visit.visitDate,
    });

    return res.status(201).json(visit);
  }),
);

router.get(
  '/queue',
  asyncHandler(async (req, res) => {
    const parsed = VisitQueueQuery.safeParse(req.query);
    if (!parsed.success) {
      return handleValidationError(req, res, parsed.error.issues);
    }

    const visits = await visitRepository.getDoctorQueue(parsed.data);

    const uniquePatientIds = Array.from(new Set(visits.map((v) => v.patientId)));
    const patientResults = await Promise.all(
      uniquePatientIds.map((id) => patientRepository.getById(id)),
    );

    const patientNameMap = new Map<string, string>();
    for (const p of patientResults) {
      if (!p) continue;
      patientNameMap.set(p.patientId, p.name);
    }

    const items = visits.map((v) => ({
      ...v,
      patientName: patientNameMap.get(v.patientId) ?? undefined,
    }));

    return res.status(200).json({ items });
  }),
);

const TakeSeatBody = z.object({
  visitId: VisitId,
});

router.post(
  '/queue/take-seat',
  asyncHandler(async (req, res) => {
    const parsed = TakeSeatBody.safeParse(req.body);
    if (!parsed.success) {
      return handleValidationError(req, res, parsed.error.issues);
    }

    try {
      const updated = await visitRepository.updateStatus(parsed.data.visitId, 'IN_PROGRESS');
      if (!updated) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Visit not found',
          traceId: req.requestId,
        });
      }
      return res.status(200).json(updated);
    } catch (err) {
      if (err instanceof DoctorBusyError) {
        return res.status(409).json({
          error: err.code,
          message: err.message,
          traceId: req.requestId,
        });
      }
      if (err instanceof InvalidStatusTransitionError) {
        return res.status(409).json({
          error: err.code,
          message: err.message,
          traceId: req.requestId,
        });
      }
      throw err;
    }
  }),
);

router.get(
  '/:visitId',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return handleValidationError(req, res, id.error.issues);
    }

    const visit = await visitRepository.getById(id.data);
    if (!visit) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Visit not found',
        traceId: req.requestId,
      });
    }

    return res.status(200).json(visit);
  }),
);

router.patch(
  '/:visitId/status',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return handleValidationError(req, res, id.error.issues);
    }

    const parsedBody = VisitStatusUpdate.safeParse(req.body);
    if (!parsedBody.success) {
      return handleValidationError(req, res, parsedBody.error.issues);
    }

    try {
      const updated = await visitRepository.updateStatus(id.data, parsedBody.data.status);
      if (!updated) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Visit not found',
          traceId: req.requestId,
        });
      }

      void publishDoctorQueueUpdated({
        doctorId: updated.doctorId,
        visitDate: updated.visitDate,
      });

      return res.status(200).json(updated);
    } catch (err) {
      if (err instanceof InvalidStatusTransitionError) {
        return res.status(409).json({
          error: err.code,
          message: err.message,
          traceId: req.requestId,
        });
      }
      if (err instanceof DoctorBusyError) {
        return res.status(409).json({
          error: err.code,
          message: err.message,
          traceId: req.requestId,
        });
      }
      throw err;
    }
  }),
);

router.get(
  '/:visitId/followup',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return handleValidationError(req, res, id.error.issues);
    }

    const followup = await followupRepository.getByVisitId(id.data);
    if (!followup) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Follow-up not found',
        traceId: req.requestId,
      });
    }

    return res.status(200).json(followup);
  }),
);

router.put(
  '/:visitId/followup',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return handleValidationError(req, res, id.error.issues);
    }

    const parsedBody = FollowUpUpsert.safeParse(req.body);
    if (!parsedBody.success) {
      return handleValidationError(req, res, parsedBody.error.issues);
    }

    try {
      const followup = await followupRepository.upsertForVisit(id.data, parsedBody.data);

      if (req.auth) {
        logAudit({
          actorUserId: req.auth.userId,
          action: 'FOLLOWUP_UPSERT',
          entity: {
            type: 'VISIT',
            id: id.data,
          },
          meta: {
            followUpDate: followup.followUpDate,
            status: followup.status,
          },
        });
      }

      return res.status(200).json(followup);
    } catch (err) {
      if (err instanceof FollowUpRuleViolationError) {
        return res.status(400).json({
          error: err.code,
          message: err.message,
          traceId: req.requestId,
        });
      }
      throw err;
    }
  }),
);

router.patch(
  '/:visitId/followup/status',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return handleValidationError(req, res, id.error.issues);
    }

    const parsedBody = FollowUpStatusUpdate.safeParse(req.body);
    if (!parsedBody.success) {
      return handleValidationError(req, res, parsedBody.error.issues);
    }

    const updated = await followupRepository.updateStatus(id.data, parsedBody.data);
    if (!updated) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Follow-up not found',
        traceId: req.requestId,
      });
    }

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'FOLLOWUP_STATUS_UPDATE',
        entity: {
          type: 'VISIT',
          id: id.data,
        },
        meta: {
          status: updated.status,
        },
      });
    }

    return res.status(200).json(updated);
  }),
);

const RxCreateBody = z.object({
  lines: z.array(RxLine).min(1),
});

router.post(
  '/:visitId/rx',
  requireRole('DOCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return handleValidationError(req, res, id.error.issues);
    }

    const parsedBody = RxCreateBody.safeParse(req.body);
    if (!parsedBody.success) {
      return handleValidationError(req, res, parsedBody.error.issues);
    }

    const visit = await visitRepository.getById(id.data);
    if (!visit) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Visit not found',
        traceId: req.requestId,
      });
    }

    const patient = await patientRepository.getById(visit.patientId);
    if (!patient || patient.isDeleted) {
      return res.status(404).json({
        error: 'PATIENT_NOT_FOUND',
        message: 'Cannot create prescriptions for deleted or missing patient',
        traceId: req.requestId,
      });
    }

    const { lines } = parsedBody.data;
    const now = Date.now();
    const jsonKey = `rx/${visit.visitId}/${randomUUID()}.json`;

    const jsonPayload = {
      visitId: visit.visitId,
      doctorId: visit.doctorId,
      lines,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await withRetry(() =>
        s3Client.send(
          new PutObjectCommand({
            Bucket: XRAY_BUCKET_NAME,
            Key: jsonKey,
            Body: JSON.stringify(jsonPayload),
            ContentType: 'application/json',
            ServerSideEncryption: 'AES256',
          }),
        ),
      );
    } catch (err) {
      logError('rx_s3_put_failed', {
        reqId: req.requestId,
        visitId: visit.visitId,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : { message: String(err) },
      });

      throw new PrescriptionStorageError();
    }

    const prescription = await prescriptionRepository.createForVisit({
      visit,
      lines,
      jsonKey,
    });

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'RX_CREATED',
        entity: {
          type: 'RX',
          id: prescription.rxId,
        },
        meta: {
          visitId: prescription.visitId,
          version: prescription.version,
        },
      });
    }

    return res.status(201).json({
      rxId: prescription.rxId,
      visitId: prescription.visitId,
      version: prescription.version,
      createdAt: prescription.createdAt,
      updatedAt: prescription.updatedAt,
    });
  }),
);

const XrayMetaDataInput = z.object({
  xrayId: XrayId,
  contentType: XrayContentType,
  size: z
    .number()
    .int()
    .min(1024)
    .max(10 * 1024 * 1024),
  takenAt: z.number().int().nonnegative(),
  takenByUserId: UserId,
  thumbKey: z.string().min(1).optional(),
});

router.post(
  '/:visitId/xrays',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return handleValidationError(req, res, id.error.issues);
    }

    const parsedBody = XrayMetaDataInput.safeParse(req.body);
    if (!parsedBody.success) {
      return handleValidationError(req, res, parsedBody.error.issues);
    }

    const visit = await visitRepository.getById(id.data);
    if (!visit) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Visit not found',
        traceId: req.requestId,
      });
    }

    const patient = await patientRepository.getById(visit.patientId);
    if (!patient || patient.isDeleted) {
      return res.status(404).json({
        error: 'PATIENT_NOT_FOUND',
        message: 'Cannot attach X-rays to deleted or missing patient',
        traceId: req.requestId,
      });
    }

    const { xrayId, contentType, size, takenAt, takenByUserId, thumbKey } = parsedBody.data;

    const contentKey = buildXrayObjectKey(visit.visitId, xrayId, 'original', contentType);

    let effectiveThumbKey = thumbKey;

    if (!effectiveThumbKey) {
      const autoThumbKey = buildXrayObjectKey(visit.visitId, xrayId, 'thumb', contentType);

      try {
        await generateXrayThumbnail({
          contentKey,
          thumbKey: autoThumbKey,
          contentType: contentType as 'image/jpeg' | 'image/png',
        });
        effectiveThumbKey = autoThumbKey;
      } catch (err) {
        logError('xray_thumbnail_failed', {
          reqId: req.requestId,
          visitId: req.params.visitId,
          xrayId,
          error:
            err instanceof Error
              ? { name: err.name, message: err.message }
              : { message: String(err) },
        });
        effectiveThumbKey = undefined;
      }
    }

    try {
      const xray = await xrayRepository.putMetadata({
        visit,
        xrayId,
        contentType,
        size,
        takenAt,
        takenByUserId,
        contentKey,
        ...(effectiveThumbKey !== undefined ? { thumbKey: effectiveThumbKey } : {}),
      });

      if (req.auth) {
        logAudit({
          actorUserId: req.auth.userId,
          action: 'XRAY_METADATA_CREATED',
          entity: {
            type: 'XRAY',
            id: xray.xrayId,
          },
          meta: {
            visitId: xray.visitId,
            contentType: xray.contentType,
            size: xray.size,
            hasThumb: !!xray.thumbKey,
          },
        });
      }

      return res.status(201).json(xray);
    } catch (err) {
      if (err instanceof XrayConflictError) {
        return res.status(409).json({
          error: err.code,
          message: err.message,
          traceId: req.requestId,
        });
      }
      throw err;
    }
  }),
);

router.get(
  '/:visitId/xrays',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return handleValidationError(req, res, id.error.issues);
    }

    const visit = await visitRepository.getById(id.data);
    if (!visit) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Visit not found',
        traceId: req.requestId,
      });
    }

    const patient = await patientRepository.getById(visit.patientId);
    if (!patient || patient.isDeleted) {
      return res.status(404).json({
        error: 'PATIENT_NOT_FOUND',
        message: 'Patient not found or has been deleted',
        traceId: req.requestId,
      });
    }

    const items = await xrayRepository.listByVisit(visit.visitId);

    return res.status(200).json({ items });
  }),
);

router.post(
  '/:visitId/checkout',
  requireRole('RECEPTION', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return handleValidationError(req, res, id.error.issues);
    }

    const parsedBody = BillingCheckoutInput.safeParse(req.body);
    if (!parsedBody.success) {
      return handleValidationError(req, res, parsedBody.error.issues);
    }

    try {
      const billing = await billingRepository.checkout(id.data, parsedBody.data);

      if (req.auth) {
        logAudit({
          actorUserId: req.auth.userId,
          action: 'VISIT_CHECKOUT',
          entity: {
            type: 'VISIT',
            id: id.data,
          },
          meta: {
            total: billing.total,
            hasFollowUp: !!parsedBody.data.followUp,
          },
        });
      }

      const visit = await visitRepository.getById(id.data);
      if (visit) {
        void publishDoctorQueueUpdated({
          doctorId: visit.doctorId,
          visitDate: visit.visitDate,
        });
      }

      return res.status(201).json(billing);
    } catch (err) {
      if (err instanceof VisitNotDoneError) {
        return res.status(409).json({
          error: err.code,
          message: err.message,
          traceId: req.requestId,
        });
      }
      if (err instanceof DuplicateCheckoutError) {
        return res.status(409).json({
          error: err.code,
          message: err.message,
          traceId: req.requestId,
        });
      }
      if (err instanceof BillingRuleViolationError) {
        return res.status(400).json({
          error: err.code,
          message: err.message,
          traceId: req.requestId,
        });
      }
      if (err instanceof FollowUpRuleViolationError) {
        return res.status(400).json({
          error: err.code,
          message: err.message,
          traceId: req.requestId,
        });
      }
      throw err;
    }
  }),
);

router.get(
  '/:visitId/bill',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return handleValidationError(req, res, id.error.issues);
    }

    const billing = await billingRepository.getByVisitId(id.data);
    if (!billing) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Billing not found',
        traceId: req.requestId,
      });
    }
    return res.status(200).json(billing);
  }),
);

export default router;
