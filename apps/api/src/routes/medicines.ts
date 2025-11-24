import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { MedicineSearchQuery, QuickAddMedicineInput } from '@dms/types';
import type { MedicineTypeaheadItem } from '@dms/types';
import { medicinePresetRepository } from '../repositories/medicinePresetRepository';

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
        return handleValidationError(res, err.issues);
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
      return handleValidationError(res, parsed.error.issues);
    }

    // TODO (Day 12): derive createdByUserId from req.user (doctor).
    const createdByUserId = 'INLINE_DOCTOR_PLACEHOLDER';

    const preset = await medicinePresetRepository.quickAdd({
      input: parsed.data,
      createdByUserId,
      source: 'INLINE_DOCTOR',
    });

    return res.status(201).json(preset);
  }),
);

export default router;
