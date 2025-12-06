import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { VisitId, XrayId, XrayContentType } from '@dms/types';
import { visitRepository } from '../repositories/visitRepository';
import { xrayRepository } from '../repositories/xrayRepository';
import { XRAY_BUCKET_NAME } from '../config/env';
import { getPresignedUploadUrl, getPresignedDownloadUrl } from '../lib/s3';
import { patientRepository } from '../repositories/patientRepository';
import { v4 as randomUUID } from 'uuid';
import { logAudit, logError } from '../lib/logger';
import { sendZodValidationError } from '../lib/validation';

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

const MIN_SIZE_BYTES = 1024;
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const PresignRequest = z.object({
  visitId: VisitId,
  contentType: XrayContentType,
  size: z.number().int().min(MIN_SIZE_BYTES).max(MAX_SIZE_BYTES),
});
type PresignRequest = z.infer<typeof PresignRequest>;

const UrlQuery = z.object({
  size: z.enum(['thumb', 'original']).optional().default('original'),
});
type UrlQuery = z.infer<typeof UrlQuery>;

type XrayObjectVariant = 'original' | 'thumb';

const IMAGE_EXTENSION_BY_TYPE: Record<z.infer<typeof XrayContentType>, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export const buildXrayObjectKey = (
  visitId: string,
  xrayId: string,
  variant: XrayObjectVariant,
  contentType: z.infer<typeof XrayContentType>,
): string => {
  const ext = IMAGE_EXTENSION_BY_TYPE[contentType] ?? 'bin';
  return `xray/${visitId}/${xrayId}/${variant}.${ext}`;
};

router.post(
  '/presign',
  asyncHandler(async (req, res) => {
    const parsed = PresignRequest.safeParse(req.body);
    if (!parsed.success) {
      return handleValidationError(req, res, parsed.error.issues);
    }

    const { visitId, contentType, size } = parsed.data;

    const visit = await visitRepository.getById(visitId);
    if (!visit) {
      return res.status(404).json({
        error: 'VISIT_NOT_FOUND',
        message: 'Visit must exist to attach X-rays',
        traceId: req.requestId,
      });
    }

    const patient = await patientRepository.getById(visit.patientId);
    if (!patient || patient.isDeleted) {
      return res.status(404).json({
        error: 'PATIENT_NOT_FOUND',
        message: 'Cannot upload X-rays for a deleted or missing patient',
        traceId: req.requestId,
      });
    }

    const xrayId = randomUUID();
    const contentKey = buildXrayObjectKey(visit.visitId, xrayId, 'original', contentType);

    let uploadUrl: string;
    try {
      uploadUrl = await withRetry(() =>
        getPresignedUploadUrl({
          bucket: XRAY_BUCKET_NAME,
          key: contentKey,
          contentType,
          contentLength: size,
          expiresInSeconds: 90,
          serverSideEncryption: 'AES256',
        }),
      );
    } catch (err) {
      logError('xray_presign_failed', {
        reqId: req.requestId,
        visitId,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : { message: String(err) },
      });

      return res.status(503).json({
        error: 'XRAY_PRESIGN_FAILED',
        message: 'Unable to create X-ray upload URL, please retry.',
        traceId: req.requestId,
      });
    }

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'XRAY_PRESIGN_UPLOAD',
        entity: {
          type: 'VISIT',
          id: visit.visitId,
        },
        meta: {
          xrayId,
          contentType,
          size,
        },
      });
    }

    return res.status(201).json({
      xrayId,
      key: contentKey,
      uploadUrl,
      Headers: {
        'Content-Type': contentType,
      },
      expiresInSeconds: 90,
    });
  }),
);

router.get(
  '/:xrayId/url',
  asyncHandler(async (req, res) => {
    const idResult = XrayId.safeParse(req.params.xrayId);
    if (!idResult.success) {
      return handleValidationError(req, res, idResult.error.issues);
    }

    const queryResult = UrlQuery.safeParse(req.query);
    if (!queryResult.success) {
      return handleValidationError(req, res, queryResult.error.issues);
    }

    const { size } = queryResult.data;

    const meta = await xrayRepository.getById(idResult.data);
    if (!meta) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'X-ray not found',
        traceId: req.requestId,
      });
    }

    const visit = await visitRepository.getById(meta.visitId);
    if (!visit) {
      return res.status(404).json({
        error: 'VISIT_NOT_FOUND',
        message: 'Visit not found for this X-ray',
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

    const keyToUse = size === 'thumb' && meta.thumbKey != null ? meta.thumbKey : meta.contentKey;

    let url: string;
    try {
      url = await withRetry(() =>
        getPresignedDownloadUrl({
          bucket: XRAY_BUCKET_NAME,
          key: keyToUse,
          expiresInSeconds: 90,
        }),
      );
    } catch (err) {
      logError('xray_url_presign_failed', {
        reqId: req.requestId,
        xrayId: meta.xrayId,
        visitId: meta.visitId,
        variant: size,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : { message: String(err) },
      });

      return res.status(503).json({
        error: 'XRAY_URL_FAILED',
        message: 'Unable to create X-ray download URL, please retry.',
        traceId: req.requestId,
      });
    }

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'XRAY_URL_REQUEST',
        entity: {
          type: 'XRAY',
          id: meta.xrayId,
        },
        meta: {
          visitId: meta.visitId,
          variant: size,
          hasThumb: !!meta.thumbKey,
        },
      });
    }

    return res.status(200).json({
      url,
      variant: size,
    });
  }),
);

export default router;
