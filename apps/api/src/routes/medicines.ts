import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { MedicineSearchQuery, QuickAddMedicineInput } from '@dms/types';
import type { MedicineTypeaheadItem } from '@dms/types';
import { medicinePresetRepository } from '../repositories/medicinePresetRepository';
import { logAudit } from '../lib/logger';
import { sendZodValidationError } from '../lib/validation';

const router = express.Router();

const handleValidationError = (req: Request, res: Response, issues: z.ZodError['issues']) => {
  return sendZodValidationError(req, res, issues);
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

const buildSearchQueryFromRequest = (req: Request): MedicineSearchQuery => {
  const query =
    typeof req.query.query === 'string' && req.query.query.trim().length > 0
      ? req.query.query
      : undefined;

  const limitRaw = req.query.limit;
  const limit = typeof limitRaw === 'string' && limitRaw.length > 0 ? Number(limitRaw) : undefined;

  const parsed = MedicineSearchQuery.safeParse({
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
    let searchQuery: MedicineSearchQuery;
    try {
      searchQuery = buildSearchQueryFromRequest(req);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return handleValidationError(req, res, err.issues);
      }
      throw err;
    }

    const searchParams: { query?: string; limit: number } = {
      limit: searchQuery.limit,
    };

    if (typeof searchQuery.query === 'string') {
      searchParams.query = searchQuery.query;
    }

    const items: MedicineTypeaheadItem[] = await medicinePresetRepository.search(searchParams);

    return res.status(200).json({
      items,
    });
  }),
);

router.post(
  '/quick-add',
  asyncHandler(async (req, res) => {
    const parsed = QuickAddMedicineInput.safeParse(req.body);
    if (!parsed.success) {
      return handleValidationError(req, res, parsed.error.issues);
    }

    // Router is mounted behind authMiddleware + requireRole('DOCTOR' | 'ADMIN'),
    // so req.auth should be present for real usage.
    const createdByUserId = req.auth?.userId ?? 'INLINE_DOCTOR_PLACEHOLDER';

    const preset = await medicinePresetRepository.quickAdd({
      input: parsed.data,
      createdByUserId,
      source: 'INLINE_DOCTOR',
    });

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'MEDICINE_QUICK_ADD',
        entity: {
          type: 'MEDICINE',
          id: preset.id,
        },
        meta: {
          normalizedName: preset.normalizedName,
          source: preset.source,
          verified: preset.verified,
        },
      });
    }

    return res.status(201).json(preset);
  }),
);

export default router;
