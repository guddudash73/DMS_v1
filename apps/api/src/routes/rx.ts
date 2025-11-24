import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { RxId } from '@dms/types';
import { prescriptionRepository } from '../repositories/prescriptionRepository';
import { XRAY_BUCKET_NAME } from '../config/env';
import { getPresignedDownloadUrl } from '../lib/s3';

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

const RxIdParam = z.object({
  rxId: RxId,
});
type RxIdParam = z.infer<typeof RxIdParam>;

router.get(
  '/:rxId/json-url',
  asyncHandler(async (req, res) => {
    const parsedId = RxIdParam.safeParse(req.params);
    if (!parsedId.success) {
      return handleValidationError(res, parsedId.error.issues);
    }

    const { rxId } = parsedId.data;

    const meta = await prescriptionRepository.getById(rxId);
    if (!meta) {
      return res.status(404).json({
        error: 'RX_NOT_FOUND',
        message: 'Prescription not found',
      });
    }

    const url = await getPresignedDownloadUrl({
      bucket: XRAY_BUCKET_NAME,
      key: meta.jsonKey,
      expiresInSeconds: 90,
    });

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
  asyncHandler(async (req, res) => {
    const parsedId = RxIdParam.safeParse(req.params);
    if (!parsedId.success) {
      return handleValidationError(res, parsedId.error.issues);
    }

    return res.status(200).json({
      status: 'NOT_IMPLEMENTED',
      message: 'PDF generation for prescriptions is not implemented yet.',
    });
  }),
);

export default router;
