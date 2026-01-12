// apps/api/src/routes/medicines.ts
import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  MedicineSearchQuery,
  QuickAddMedicineInput,
  MedicineCatalogSearchQuery,
  DoctorUpdateMedicineRequest,
} from '@dms/types';
import type { MedicineTypeaheadItem } from '@dms/types';
import { medicinePresetRepository } from '../repositories/medicinePresetRepository';
import { logAudit } from '../lib/logger';
import { sendZodValidationError } from '../lib/validation';
import { qNumber, qTrimmed } from '../lib/httpQuery';
import { pString } from '../lib/httpParams';

const router = express.Router();

const handleValidationError = (req: Request, res: Response, issues: z.ZodError['issues']) => {
  return sendZodValidationError(req, res, issues);
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

const buildSearchQueryFromRequest = (req: Request): MedicineSearchQuery => {
  const query = qTrimmed(req, 'query');
  const limit = qNumber(req, 'limit');

  const parsed = MedicineSearchQuery.safeParse({ query, limit });
  if (!parsed.success) throw parsed.error;
  return parsed.data;
};

const buildCatalogQueryFromRequest = (req: Request) => {
  const query = qTrimmed(req, 'query');
  const limit = qNumber(req, 'limit');
  const cursor = qTrimmed(req, 'cursor');

  const parsed = MedicineCatalogSearchQuery.safeParse({ query, limit, cursor });
  if (!parsed.success) throw parsed.error;
  return parsed.data;
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let searchQuery: MedicineSearchQuery;
    try {
      searchQuery = buildSearchQueryFromRequest(req);
    } catch (err) {
      if (err instanceof z.ZodError) return handleValidationError(req, res, err.issues);
      throw err;
    }

    const searchParams: { query?: string; limit: number } = {
      limit: searchQuery.limit,
    };

    if (typeof searchQuery.query === 'string') {
      searchParams.query = searchQuery.query;
    }

    const items: MedicineTypeaheadItem[] = await medicinePresetRepository.search(searchParams);

    return res.status(200).json({ items });
  }),
);

router.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    if (!req.auth?.userId) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Login required',
        traceId: req.requestId,
      });
    }

    let q: z.infer<typeof MedicineCatalogSearchQuery>;
    try {
      q = buildCatalogQueryFromRequest(req);
    } catch (err) {
      if (err instanceof z.ZodError) return handleValidationError(req, res, err.issues);
      throw err;
    }

    const result = await medicinePresetRepository.catalogList({
      query: q.query,
      limit: q.limit,
      cursor: q.cursor,
      viewerUserId: req.auth.userId,
    });

    return res.status(200).json({
      items: result.items,
      nextCursor: result.nextCursor,
    });
  }),
);

router.post(
  '/quick-add',
  asyncHandler(async (req, res) => {
    const parsed = QuickAddMedicineInput.safeParse(req.body);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

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
        entity: { type: 'MEDICINE', id: preset.id },
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

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!req.auth?.userId) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Login required',
        traceId: req.requestId,
      });
    }

    const id = pString(req, 'id');
    if (!id) {
      return res.status(400).json({
        error: 'INVALID_MEDICINE_ID',
        message: 'Medicine id is required',
        traceId: req.requestId,
      });
    }

    const parsed = DoctorUpdateMedicineRequest.safeParse(req.body);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const updated = await medicinePresetRepository.doctorUpdate(id, parsed.data, req.auth.userId);
    if (updated === 'FORBIDDEN') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You can only edit medicines created by you.',
        traceId: req.requestId,
      });
    }
    if (!updated) {
      return res.status(404).json({
        error: 'MEDICINE_NOT_FOUND',
        message: 'Medicine not found',
        traceId: req.requestId,
      });
    }

    logAudit({
      actorUserId: req.auth.userId,
      action: 'DOCTOR_UPDATE_MEDICINE',
      entity: { type: 'MEDICINE', id },
      meta: { displayName: updated.displayName },
    });

    return res.status(200).json(updated);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!req.auth?.userId) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Login required',
        traceId: req.requestId,
      });
    }

    const id = pString(req, 'id');
    if (!id) {
      return res.status(400).json({
        error: 'INVALID_MEDICINE_ID',
        message: 'Medicine id is required',
        traceId: req.requestId,
      });
    }

    const ok = await medicinePresetRepository.doctorDelete(id, req.auth.userId);
    if (ok === 'FORBIDDEN') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You can only delete medicines created by you.',
        traceId: req.requestId,
      });
    }
    if (!ok) {
      return res.status(404).json({
        error: 'MEDICINE_NOT_FOUND',
        message: 'Medicine not found',
        traceId: req.requestId,
      });
    }

    logAudit({
      actorUserId: req.auth.userId,
      action: 'DOCTOR_DELETE_MEDICINE',
      entity: { type: 'MEDICINE', id },
    });

    return res.status(200).json({ ok: true });
  }),
);

export default router;
