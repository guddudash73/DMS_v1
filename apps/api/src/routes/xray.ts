import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { VisitId } from '@dms/types';
import { XrayId, XrayContentType } from '@dms/types';
import { visitRepository } from '../repositories/visitRepository';
import { xrayRepository } from '../repositories/xrayRepository';
import { XRAY_BUCKET_NAME } from '../config/env';
import { getPresignedUploadUrl, getPresignedDownloadUrl } from '../lib/s3';
import { patientRepository } from '../repositories/patientRepository';

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

type XrayObjectVarient = 'original' | 'thumb';

const IMAGE_EXTENSION_BY_TYPE: Record<z.infer<typeof XrayContentType>, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export const buildXrayObjectKey = (
  visitId: string,
  xrayId: string,
  variant: XrayObjectVarient,
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
      return handleValidationError(res, parsed.error.issues);
    }

    const { visitId, contentType, size } = parsed.data;

    const visit = await visitRepository.getById(visitId);
    if (!visit) {
      return res.status(404).json({
        error: 'VISIT_NOT_FOUND',
        message: 'Visit must exist to attach X-rays',
      });
    }

    const patient = await patientRepository.getById(visit.patientId);
    if (!patient || patient.isDeleted) {
      return res.status(404).json({
        error: 'PATIENT_NOT_FOUND',
        message: 'Cannot upload X-rays for a deleted or missing patient',
      });
    }

    const xrayId = (await import('node:crypto')).randomUUID();
    const contentKey = buildXrayObjectKey(visit.visitId, xrayId, 'original', contentType);

    const uploadUrl = await getPresignedUploadUrl({
      bucket: XRAY_BUCKET_NAME,
      key: contentKey,
      contentType,
      contentLength: size,
      expiresInSeconds: 90,
    });

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
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid xray id',
      });
    }

    const queryResult = UrlQuery.safeParse(req.query);
    if (!queryResult.success) {
      return handleValidationError(res, queryResult.error.issues);
    }

    const { size } = queryResult.data;

    const meta = await xrayRepository.getById(idResult.data);
    if (!meta) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const visit = await visitRepository.getById(meta.visitId);
    if (!visit) {
      return res.status(404).json({
        error: 'VISIT_NOT_FOUND',
        message: 'Visit not found for this X-ray',
      });
    }

    const patient = await patientRepository.getById(visit.patientId);
    if (!patient || patient.isDeleted) {
      return res.status(404).json({
        error: 'PATIENT_NOT_FOUND',
        message: 'Patient not found or has been deleted',
      });
    }

    const keyToUse = size === 'thumb' && meta.thumbKey != null ? meta.thumbKey : meta.contentKey;

    const url = await getPresignedDownloadUrl({
      bucket: XRAY_BUCKET_NAME,
      key: keyToUse,
      expiresInSeconds: 90,
    });

    return res.status(200).json({
      url,
      variant: size,
    });
  }),
);

export default router;
