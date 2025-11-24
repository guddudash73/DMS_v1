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
} from '@dms/types';
import { randomUUID } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { visitRepository, InvalidStatusTransitionError } from '../repositories/visitRepository';
import { followupRepository, FollowUpRuleViolationError } from '../repositories/followupRepository';
import { xrayRepository } from '../repositories/xrayRepository';
import { prescriptionRepository } from '../repositories/prescriptionRepository';
import { buildXrayObjectKey } from './xray';
import { s3Client } from '../lib/s3';
import { XRAY_BUCKET_NAME } from '../config/env';

const router = express.Router();

const handleValidationError = (res: Response, issues: unknown) => {
  return res.status(400).json({
    error: 'VALIDATION_ERROR',
    issues,
  });
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = VisitCreate.safeParse(req.body);
    if (!parsed.success) {
      return handleValidationError(res, parsed.error.issues);
    }

    const visit = await visitRepository.create(parsed.data);
    return res.status(201).json(visit);
  }),
);

router.get(
  '/queue',
  asyncHandler(async (req, res) => {
    const parsed = VisitQueueQuery.safeParse(req.query);
    if (!parsed.success) {
      return handleValidationError(res, parsed.error.issues);
    }

    const visits = await visitRepository.getDoctorQueue(parsed.data);
    return res.status(200).json({ items: visits });
  }),
);

router.get(
  '/:visitId',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid visit id',
      });
    }

    const visit = await visitRepository.getById(id.data);
    if (!visit) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    return res.status(200).json(visit);
  }),
);

router.patch(
  '/:visitId/status',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid visit id',
      });
    }

    const parsedBody = VisitStatusUpdate.safeParse(req.body);
    if (!parsedBody.success) {
      return handleValidationError(res, parsedBody.error.issues);
    }

    try {
      const updated = await visitRepository.updateStatus(id.data, parsedBody.data.status);
      if (!updated) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      return res.status(200).json(updated);
    } catch (err) {
      if (err instanceof InvalidStatusTransitionError) {
        return res.status(409).json({
          error: err.code,
          message: err.message,
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
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid visit id',
      });
    }

    const followup = await followupRepository.getByVisitId(id.data);
    if (!followup) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    return res.status(200).json(followup);
  }),
);

router.put(
  '/:visitId/followup',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid visit id',
      });
    }

    const parsedBody = FollowUpUpsert.safeParse(req.body);
    if (!parsedBody.success) {
      return handleValidationError(res, parsedBody.error.issues);
    }

    try {
      const followup = await followupRepository.upsertForVisit(id.data, parsedBody.data);
      return res.status(200).json(followup);
    } catch (err) {
      if (err instanceof FollowUpRuleViolationError) {
        return res.status(400).json({
          error: err.code,
          message: err.message,
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
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid visit id',
      });
    }

    const parsedBody = FollowUpStatusUpdate.safeParse(req.body);
    if (!parsedBody.success) {
      return handleValidationError(res, parsedBody.error.issues);
    }

    const updated = await followupRepository.updateStatus(id.data, parsedBody.data);
    if (!updated) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    return res.status(200).json(updated);
  }),
);

const RxCreateBody = z.object({
  lines: z.array(RxLine).min(1),
});

router.post(
  '/:visitId/rx',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid visit id',
      });
    }

    const parsedBody = RxCreateBody.safeParse(req.body);
    if (!parsedBody.success) {
      return handleValidationError(res, parsedBody.error.issues);
    }

    const visit = await visitRepository.getById(id.data);
    if (!visit) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    // TODO (Day 17): enforce non-deleted patient/visit once soft-delete is implemented.
    // TODO (Day 12): restrict this route to DOCTOR role via auth middleware.

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

    await s3Client.send(
      new PutObjectCommand({
        Bucket: XRAY_BUCKET_NAME,
        Key: jsonKey,
        Body: JSON.stringify(jsonPayload),
        ContentType: 'application/json',
      }),
    );

    const prescription = await prescriptionRepository.createForVisit({
      visit,
      lines,
      jsonKey,
    });

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
});

router.post(
  '/:visitId/xrays',
  asyncHandler(async (req, res) => {
    const id = VisitId.safeParse(req.params.visitId);
    if (!id.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid visit id',
      });
    }

    const parsedBody = XrayMetaDataInput.safeParse(req.body);
    if (!parsedBody.success) {
      return handleValidationError(res, parsedBody.error.issues);
    }

    const visit = await visitRepository.getById(id.data);
    if (!visit) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const { xrayId, contentType, size, takenAt, takenByUserId } = parsedBody.data;

    const contentKey = buildXrayObjectKey(visit.visitId, xrayId, 'original', contentType);

    const xray = await xrayRepository.putMetadata({
      visit,
      xrayId,
      contentType,
      size,
      takenAt,
      takenByUserId,
      contentKey,
    });

    return res.status(201).json(xray);
  }),
);

export default router;
