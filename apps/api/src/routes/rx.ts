// apps/api/src/routes/rx.ts
import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { RxId } from '@dms/types';
import { prescriptionRepository } from '../repositories/prescriptionRepository';
import { getEnv } from '../config/env';
import { getPresignedDownloadUrl } from '../lib/s3';
import { visitRepository } from '../repositories/visitRepository';
import { patientRepository } from '../repositories/patientRepository';
import { sendZodValidationError } from '../lib/validation';
import { logError } from '../lib/logger';
import { RxLine } from '@dms/types';

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

const RxIdParam = z.object({
  rxId: RxId,
});
type RxIdParam = z.infer<typeof RxIdParam>;

const RxUpdateBody = z.object({
  lines: z.array(RxLine).min(1),
  jsonKey: z.string().min(1).optional(),
});

router.get(
  '/:rxId/json-url',
  asyncHandler(async (req, res) => {
    const env = getEnv();

    const parsedId = RxIdParam.safeParse(req.params);
    if (!parsedId.success) {
      return handleValidationError(req, res, parsedId.error.issues);
    }

    const { rxId } = parsedId.data;

    const meta = await prescriptionRepository.getById(rxId);
    if (!meta) {
      return res.status(404).json({
        error: 'RX_NOT_FOUND',
        message: 'Prescription not found',
        traceId: req.requestId,
      });
    }

    const visit = await visitRepository.getById(meta.visitId);
    if (!visit) {
      return res.status(404).json({
        error: 'VISIT_NOT_FOUND',
        message: 'Visit not found for this prescription',
        traceId: req.requestId,
      });
    }

    const patient = await patientRepository.getById(visit.patientId);
    if (!patient) {
      return res.status(404).json({
        error: 'PATIENT_NOT_FOUND',
        message: 'Patient not found or has been deleted',
        traceId: req.requestId,
      });
    }

    let url: string;
    try {
      url = await withRetry(
        () =>
          getPresignedDownloadUrl({
            bucket: env.XRAY_BUCKET_NAME,
            key: meta.jsonKey,
            expiresInSeconds: 90,
          }),
        3,
        100,
      );
    } catch (err) {
      logError('rx_url_presign_failed', {
        reqId: req.requestId,
        rxId: meta.rxId,
        visitId: meta.visitId,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : { message: String(err) },
      });

      return res.status(503).json({
        error: 'RX_URL_FAILED',
        message: 'Unable to create prescription download URL, please retry.',
        traceId: req.requestId,
      });
    }

    return res.status(200).json({
      rxId: meta.rxId,
      visitId: meta.visitId,
      version: meta.version,
      url,
      expiresInSeconds: 90,
    });
  }),
);

router.get(
  '/:rxId/pdf-url',
  asyncHandler(async (_req, res) => {
    return res.status(200).json({
      status: 'NOT_IMPLEMENTED',
      message: 'PDF generation for prescriptions is not implemented yet.',
    });
  }),
);

router.put(
  '/:rxId',
  asyncHandler(async (req, res) => {
    const parsedId = RxIdParam.safeParse(req.params);
    if (!parsedId.success) return handleValidationError(req, res, parsedId.error.issues);

    const body = RxUpdateBody.safeParse(req.body);
    if (!body.success) return handleValidationError(req, res, body.error.issues);

    const rxId = parsedId.data.rxId;
    const existing = await prescriptionRepository.getById(rxId);
    if (!existing) {
      return res
        .status(404)
        .json({ error: 'RX_NOT_FOUND', message: 'Prescription not found', traceId: req.requestId });
    }

    const updated = await prescriptionRepository.updateById({
      rxId,
      lines: body.data.lines,
      jsonKey: body.data.jsonKey ?? existing.jsonKey,
    });

    if (!updated) {
      return res
        .status(404)
        .json({ error: 'RX_NOT_FOUND', message: 'Prescription not found', traceId: req.requestId });
    }

    return res.status(200).json({
      rxId: updated.rxId,
      visitId: updated.visitId,
      version: updated.version,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  }),
);

export default router;
