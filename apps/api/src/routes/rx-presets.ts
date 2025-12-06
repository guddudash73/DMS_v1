import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { PrescriptionPresetSearchQuery } from '@dms/types';
import { prescriptionPresetRepository } from '../repositories/prescriptionPresetRepository';
import { sendZodValidationError } from '../lib/validation';

const router = express.Router();

const handleValidationError = (req: Request, res: Response, issues: z.ZodError['issues']) => {
  return sendZodValidationError(req, res, issues);
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

const buildPresetSearchFromRequest = (req: Request): PrescriptionPresetSearchQuery => {
  const query =
    typeof req.query.query === 'string' && req.query.query.trim().length > 0
      ? req.query.query
      : undefined;

  const limitRaw = req.query.limit;
  const limit = typeof limitRaw === 'string' && limitRaw.length > 0 ? Number(limitRaw) : undefined;

  const parsed = PrescriptionPresetSearchQuery.safeParse({
    query,
    limit,
  });

  if (!parsed.success) {
    throw parsed.error;
  }

  return parsed.data;
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let search: PrescriptionPresetSearchQuery;
    try {
      search = buildPresetSearchFromRequest(req);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return handleValidationError(req, res, err.issues);
      }
      throw err;
    }

    const presets = await prescriptionPresetRepository.search(search);

    return res.status(200).json({
      items: presets,
    });
  }),
);

export default router;
