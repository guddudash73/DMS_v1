import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  VisitCreate,
  VisitStatusUpdate,
  VisitId,
  VisitQueueQuery,
  UserId,
  XrayId,
  XrayContentType,
  RxLine,
  BillingCheckoutInput,
  FollowUpUpsert,
  FollowUpStatusUpdate,
  FollowUpId,
  ToothDetail,
} from '@dcm/types';
import { PutObjectCommand } from '@aws-sdk/client-s3';

import {
  visitRepository,
  InvalidStatusTransitionError,
  VisitCreateRuleViolationError,
} from '../repositories/visitRepository';
import { followupRepository, FollowUpRuleViolationError } from '../repositories/followupRepository';
import { xrayRepository, XrayConflictError } from '../repositories/xrayRepository';
import { prescriptionRepository } from '../repositories/prescriptionRepository';
import { patientRepository } from '../repositories/patientRepository';
import {
  billingRepository,
  BillingRuleViolationError,
  DuplicateCheckoutError,
  VisitNotDoneError,
} from '../repositories/billingRepository';

import { buildXrayObjectKey } from './xray';
import { s3Client } from '../config/aws';
import { getEnv } from '../config/env';
import { requireRole } from '../middlewares/auth';
import { logAudit, logError } from '../lib/logger';
import { sendZodValidationError } from '../lib/validation';
import { generateXrayThumbnail } from '../services/xrayThumbnails';
import { publishClinicQueueUpdated } from '../realtime/publisher';

const router = express.Router();

const handleValidationError = (req: Request, res: Response, issues: z.ZodError['issues']) =>
  sendZodValidationError(req, res, issues);

function isOfflineVisit(v: unknown): boolean {
  return (
    typeof v === 'object' &&
    v !== null &&
    'isOffline' in v &&
    (v as { isOffline?: boolean }).isOffline === true
  );
}

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

const RxReceptionNotesBody = z.object({
  receptionNotes: z.string().max(2000),
});

const draftRxJsonKey = (visitId: string) => `rx/${visitId}/draft.json`;
const revisionRxJsonKey = (visitId: string) => `rx/${visitId}/revision.json`;

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
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const idempotencyKey =
      (req.header('idempotency-key') ?? req.header('Idempotency-Key') ?? '').trim() || undefined;

    try {
      const visit = await visitRepository.create(parsed.data, { idempotencyKey });
      const patient = await patientRepository.getById(visit.patientId);

      const patientVisits = await visitRepository.listByPatientId(visit.patientId);
      const visitNumberForPatient = patientVisits.length;

      const queue = await visitRepository.getPatientQueue({
        date: visit.visitDate,
        status: 'QUEUED',
      });

      const idx = queue.findIndex((v) => v.visitId === visit.visitId);
      const tokenNumber = idx >= 0 ? idx + 1 : Math.max(1, queue.length);

      void publishClinicQueueUpdated({ visitDate: visit.visitDate });

      type VisitWithOffline = typeof visit & { isOffline?: boolean };

      return res.status(201).json({
        visit,
        tokenPrint: {
          tokenNumber,
          visitId: visit.visitId,
          patientName: patient?.name ?? '—',
          patientPhone: patient?.phone ?? undefined,
          reason: visit.reason,
          tag: visit.tag,
          isOffline: (visit as VisitWithOffline).isOffline === true,
          visitNumberForPatient,
          createdAt: visit.createdAt,
          visitDate: visit.visitDate,
          dailyPatientNumber: visit.dailyPatientNumber,
          opdNo: visit.opdNo,
          sdId: patient?.sdId,
          patientDob: patient?.dob,
          patientGender: patient?.gender,
        },
      });
    } catch (err) {
      if (err instanceof VisitCreateRuleViolationError) {
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
  '/queue',
  asyncHandler(async (req, res) => {
    const parsed = VisitQueueQuery.safeParse(req.query);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const visits = await visitRepository.getPatientQueue(parsed.data);

    const patientIds = Array.from(new Set(visits.map((v) => v.patientId)));
    const patients = await Promise.all(patientIds.map((id) => patientRepository.getById(id)));
    const patientNameMap = new Map(patients.filter(Boolean).map((p) => [p!.patientId, p!.name]));

    return res.status(200).json({
      items: visits.map((v) => ({
        ...v,
        patientName: patientNameMap.get(v.patientId),
      })),
    });
  }),
);

router.post(
  '/queue/take-seat',
  asyncHandler(async (req, res) => {
    const parsed = z.object({ visitId: VisitId }).safeParse(req.body);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    try {
      const updated = await visitRepository.updateStatus(parsed.data.visitId, 'IN_PROGRESS');
      if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });

      void publishClinicQueueUpdated({ visitDate: updated.visitDate });
      return res.status(200).json(updated);
    } catch (err) {
      if (err instanceof InvalidStatusTransitionError) {
        return res.status(409).json({ error: err.code, message: err.message });
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
    const body = VisitStatusUpdate.safeParse(req.body);
    if (!id.success || !body.success)
      return handleValidationError(req, res, [
        ...(id.error?.issues ?? []),
        ...(body.error?.issues ?? []),
      ]);

    try {
      const updated = await visitRepository.updateStatus(id.data, body.data.status);
      if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });

      void publishClinicQueueUpdated({ visitDate: updated.visitDate });
      return res.status(200).json(updated);
    } catch (err) {
      if (err instanceof InvalidStatusTransitionError) {
        return res.status(409).json({ error: err.code, message: err.message });
      }
      throw err;
    }
  }),
);

router.get(
  '/:visitId/followups',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) return handleValidationError(req, res, id.error.issues);

    try {
      const items = await followupRepository.listByVisitId(id.data);
      return res.status(200).json({ items: items ?? [] });
    } catch (err) {
      logError('visit_followups_list_failed', {
        visitId: id.data,
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({
        error: 'VISIT_FOLLOWUPS_LIST_FAILED',
        message: 'Unable to load followups for this visit',
        traceId: req.requestId,
      });
    }
  }),
);

router.post(
  '/:visitId/followups',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) return handleValidationError(req, res, id.error.issues);

    const parsedBody = FollowUpUpsert.safeParse(req.body);
    if (!parsedBody.success) return handleValidationError(req, res, parsedBody.error.issues);

    try {
      const created = await followupRepository.createForVisit(id.data, parsedBody.data);

      if (req.auth) {
        logAudit({
          actorUserId: req.auth.userId,
          action: 'FOLLOWUP_CREATE',
          entity: {
            type: 'VISIT',
            id: id.data,
          },
          meta: {
            followUpDate: created.followUpDate,
            status: created.status,
            followupId: created.followupId,
          },
        });
      }

      return res.status(201).json(created);
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
  '/:visitId/followups/:followupId/status',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) return handleValidationError(req, res, id.error.issues);

    const fuId = FollowUpId.safeParse(req.params.followupId);
    if (!fuId.success) return handleValidationError(req, res, fuId.error.issues);

    const parsedBody = FollowUpStatusUpdate.safeParse(req.body);
    if (!parsedBody.success) return handleValidationError(req, res, parsedBody.error.issues);

    const updated = await followupRepository.updateStatus({
      visitId: id.data,
      followupId: fuId.data,
      input: parsedBody.data,
    });

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
          followupId: updated.followupId,
        },
      });
    }

    return res.status(200).json(updated);
  }),
);

const RxCreateBody = z
  .object({
    lines: z.array(RxLine).optional().default([]),
    toothDetails: z.array(ToothDetail).optional().default([]),
    doctorNotes: z.string().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    const hasLines = (val.lines?.length ?? 0) > 0;
    const hasTeeth = (val.toothDetails?.length ?? 0) > 0;

    if (!hasLines && !hasTeeth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lines'],
        message: 'Provide medicines or tooth details.',
      });
    }
  });

router.post(
  '/:visitId/rx',
  requireRole('DOCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const env = getEnv();

    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) return handleValidationError(req, res, id.error.issues);

    const parsedBody = RxCreateBody.safeParse(req.body);
    if (!parsedBody.success) return handleValidationError(req, res, parsedBody.error.issues);

    const visit = await visitRepository.getById(id.data);
    if (!visit) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Visit not found' });
    }

    if (isOfflineVisit(visit)) {
      return res.status(409).json({
        error: 'OFFLINE_VISIT_RX_NOT_ALLOWED',
        message: 'Offline visits do not support prescriptions in the database.',
      });
    }

    const patient = await patientRepository.getById(visit.patientId);
    if (!patient || patient.isDeleted) {
      return res
        .status(404)
        .json({ error: 'PATIENT_NOT_FOUND', message: 'Patient missing/deleted' });
    }

    const { lines, toothDetails, doctorNotes } = parsedBody.data;
    const now = Date.now();

    const isDone = visit.status === 'DONE';
    const jsonKey = isDone ? revisionRxJsonKey(visit.visitId) : draftRxJsonKey(visit.visitId);

    const jsonPayload: Record<string, unknown> = {
      visitId: visit.visitId,
      lines,
      toothDetails,
      createdAt: now,
      updatedAt: now,
      ...(doctorNotes !== undefined ? { doctorNotes } : {}),
    };

    try {
      await withRetry(() =>
        s3Client.send(
          new PutObjectCommand({
            Bucket: env.XRAY_BUCKET_NAME,
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
    let prescription;
    if (!isDone) {
      prescription = await prescriptionRepository.upsertDraftForVisit({
        visit,
        lines,
        jsonKey,
        toothDetails: toothDetails?.length ? toothDetails : [],
        doctorNotes,
      });
    } else {
      const revision = await prescriptionRepository.ensureRevisionForVisit({ visit, jsonKey });
      prescription =
        (await prescriptionRepository.updateById({
          rxId: revision.rxId,
          lines,
          jsonKey,
          toothDetails: toothDetails?.length ? toothDetails : [],
          doctorNotes,
        })) ?? revision;
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
        void publishClinicQueueUpdated({
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

router.patch(
  '/:visitId/bill',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) return handleValidationError(req, res, id.error.issues);

    const parsedBody = BillingCheckoutInput.safeParse(req.body);
    if (!parsedBody.success) return handleValidationError(req, res, parsedBody.error.issues);

    const updated = await billingRepository.updateBill(id.data, parsedBody.data);
    return res.status(200).json(updated);
  }),
);

router.get(
  '/:visitId/rx',
  requireRole('DOCTOR', 'ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) return handleValidationError(req, res, id.error.issues);

    const RxQuery = z.object({
      version: z.coerce.number().int().positive().optional(),
      rxId: z.string().uuid().optional(),
    });

    const q = RxQuery.safeParse(req.query);
    if (!q.success) return handleValidationError(req, res, q.error.issues);

    const visit = await visitRepository.getById(id.data);
    if (!visit) {
      return res
        .status(404)
        .json({ error: 'NOT_FOUND', message: 'Visit not found', traceId: req.requestId });
    }

    const patient = await patientRepository.getById(visit.patientId);
    if (!patient || patient.isDeleted) {
      return res.status(404).json({
        error: 'PATIENT_NOT_FOUND',
        message: 'Patient not found or deleted',
        traceId: req.requestId,
      });
    }

    const hasVisitId = (v: unknown): v is { visitId: string } =>
      typeof v === 'object' &&
      v !== null &&
      'visitId' in v &&
      typeof (v as { visitId: unknown }).visitId === 'string';
    let rx: unknown | null = null;

    if (q.data.rxId) {
      rx = await prescriptionRepository.getById(q.data.rxId);
      if (!rx) return res.status(200).json({ rx: null });

      if (!hasVisitId(rx) || rx.visitId !== visit.visitId)
        return res.status(200).json({ rx: null });

      return res.status(200).json({ rx });
    }

    if (typeof q.data.version === 'number') {
      const picked = await prescriptionRepository.getByVisitAndVersion(
        visit.visitId,
        q.data.version,
      );
      return res.status(200).json({ rx: picked ?? null });
    }

    rx = await prescriptionRepository.getCurrentForVisit(visit.visitId);
    if (!rx) return res.status(200).json({ rx: null });

    return res.status(200).json({ rx });
  }),
);

router.get(
  '/:visitId/rx/versions',
  requireRole('DOCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) return handleValidationError(req, res, id.error.issues);

    const visit = await visitRepository.getById(id.data);
    if (!visit) {
      return res
        .status(404)
        .json({ error: 'NOT_FOUND', message: 'Visit not found', traceId: req.requestId });
    }

    const items = await prescriptionRepository.listByVisit(visit.visitId);
    return res.status(200).json({ items });
  }),
);

router.post(
  '/:visitId/rx/revisions',
  requireRole('DOCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const env = getEnv();

    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) return handleValidationError(req, res, id.error.issues);

    const visit = await visitRepository.getById(id.data);
    if (!visit) return res.status(404).json({ error: 'NOT_FOUND', message: 'Visit not found' });

    if (isOfflineVisit(visit)) {
      return res.status(409).json({
        error: 'OFFLINE_VISIT_RX_NOT_ALLOWED',
        message: 'Offline visits do not support prescription revisions.',
      });
    }

    if (visit.status !== 'DONE') {
      return res.status(409).json({
        error: 'RX_REVISION_NOT_ALLOWED',
        message: 'Revisions can be created only after visit is DONE',
      });
    }

    const jsonKey = revisionRxJsonKey(visit.visitId);

    const revision = await prescriptionRepository.ensureRevisionForVisit({ visit, jsonKey });

    const now = Date.now();
    const jsonPayload: Record<string, unknown> = {
      visitId: visit.visitId,
      lines: revision.lines ?? [],
      toothDetails: revision.toothDetails ?? undefined,
      createdAt: now,
      updatedAt: now,
      ...(revision.doctorNotes !== undefined ? { doctorNotes: revision.doctorNotes } : {}),
    };

    try {
      await withRetry(() =>
        s3Client.send(
          new PutObjectCommand({
            Bucket: env.XRAY_BUCKET_NAME,
            Key: jsonKey,
            Body: JSON.stringify(jsonPayload),
            ContentType: 'application/json',
            ServerSideEncryption: 'AES256',
          }),
        ),
      );
    } catch (err) {
      logError('rx_revision_s3_put_failed', {
        reqId: req.requestId,
        visitId: req.params.visitId,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : { message: String(err) },
      });
      throw new PrescriptionStorageError();
    }

    return res.status(201).json({
      rxId: revision.rxId,
      visitId: revision.visitId,
      version: revision.version,
      createdAt: revision.createdAt,
      updatedAt: revision.updatedAt,
    });
  }),
);

router.patch(
  '/:visitId/rx/reception-notes',
  requireRole('RECEPTION', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) return handleValidationError(req, res, id.error.issues);

    const parsedBody = RxReceptionNotesBody.safeParse(req.body);
    if (!parsedBody.success) return handleValidationError(req, res, parsedBody.error.issues);

    const visit = await visitRepository.getById(id.data);
    if (!visit) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Visit not found',
        traceId: req.requestId,
      });
    }

    const rx = await prescriptionRepository.getCurrentForVisit(visit.visitId);
    if (!rx) {
      return res.status(409).json({
        error: 'RX_MISSING',
        message: 'No prescription found for this visit',
        traceId: req.requestId,
      });
    }

    const updated = await prescriptionRepository.updateReceptionNotesById({
      rxId: rx.rxId,
      receptionNotes: parsedBody.data.receptionNotes,
    });

    if (!updated) {
      return res.status(404).json({
        error: 'RX_NOT_FOUND',
        message: 'Prescription not found',
        traceId: req.requestId,
      });
    }

    return res.status(200).json({ rx: updated });
  }),
);

export default router;
