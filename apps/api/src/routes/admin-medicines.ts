import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  AdminMedicineSearchQuery,
  AdminUpdateMedicineRequest,
  type AdminMedicineListResponse,
  QuickAddMedicineInput,
} from '@dms/types';
import { medicinePresetRepository } from '../repositories/medicinePresetRepository';
import { sendZodValidationError } from '../lib/validation';
import { logAudit } from '../lib/logger';

const router = express.Router();

const handleValidationError = (req: Request, res: Response, issues: z.ZodError['issues']) => {
  return sendZodValidationError(req, res, issues);
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

const buildAdminSearch = (req: Request) => {
  const query =
    typeof req.query.query === 'string' && req.query.query.trim().length > 0
      ? req.query.query
      : undefined;

  const limitRaw = req.query.limit;
  const limit = typeof limitRaw === 'string' && limitRaw.length > 0 ? Number(limitRaw) : undefined;

  const cursor =
    typeof req.query.cursor === 'string' && req.query.cursor.trim().length > 0
      ? req.query.cursor
      : undefined;

  const status =
    typeof req.query.status === 'string' && req.query.status.trim().length > 0
      ? req.query.status
      : undefined;

  const parsed = AdminMedicineSearchQuery.safeParse({ query, limit, cursor, status });
  if (!parsed.success) throw parsed.error;
  return parsed.data;
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let search: z.infer<typeof AdminMedicineSearchQuery>;
    try {
      search = buildAdminSearch(req);
    } catch (err) {
      if (err instanceof z.ZodError) return handleValidationError(req, res, err.issues);
      throw err;
    }

    const result = await medicinePresetRepository.adminList(search);

    const payload: AdminMedicineListResponse = {
      items: result.items,
      total: result.total,
      nextCursor: result.nextCursor,
    };

    return res.status(200).json(payload);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = QuickAddMedicineInput.safeParse(req.body);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const createdByUserId = req.auth?.userId ?? 'ADMIN';

    const created = await medicinePresetRepository.quickAdd({
      input: parsed.data,
      createdByUserId,
      source: 'ADMIN_IMPORT',
    });

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'ADMIN_CREATE_MEDICINE',
        entity: { type: 'MEDICINE', id: created.id },
        meta: {
          displayName: created.displayName,
          verified: created.verified,
          source: created.source,
        },
      });
    }

    return res.status(201).json(created);
  }),
);

router.post(
  '/:id/verify',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        error: 'INVALID_MEDICINE_ID',
        message: 'Medicine id is required',
        traceId: req.requestId,
      });
    }

    const updated = await medicinePresetRepository.adminUpdate(id, { verified: true });
    if (!updated) {
      return res.status(404).json({
        error: 'MEDICINE_NOT_FOUND',
        message: 'Medicine not found',
        traceId: req.requestId,
      });
    }

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'ADMIN_VERIFY_MEDICINE',
        entity: { type: 'MEDICINE', id },
        meta: {
          displayName: updated.displayName,
          verified: updated.verified,
        },
      });
    }

    return res.status(200).json(updated);
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        error: 'INVALID_MEDICINE_ID',
        message: 'Medicine id is required',
        traceId: req.requestId,
      });
    }

    const parsed = AdminUpdateMedicineRequest.safeParse(req.body);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const updated = await medicinePresetRepository.adminUpdate(id, parsed.data);
    if (!updated) {
      return res.status(404).json({
        error: 'MEDICINE_NOT_FOUND',
        message: 'Medicine not found',
        traceId: req.requestId,
      });
    }

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'ADMIN_UPDATE_MEDICINE',
        entity: { type: 'MEDICINE', id },
        meta: {
          verified: updated.verified,
          displayName: updated.displayName,
        },
      });
    }

    return res.status(200).json(updated);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        error: 'INVALID_MEDICINE_ID',
        message: 'Medicine id is required',
        traceId: req.requestId,
      });
    }

    const ok = await medicinePresetRepository.adminDelete(id);
    if (!ok) {
      return res.status(404).json({
        error: 'MEDICINE_NOT_FOUND',
        message: 'Medicine not found',
        traceId: req.requestId,
      });
    }

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'ADMIN_DELETE_MEDICINE',
        entity: { type: 'MEDICINE', id },
      });
    }

    return res.status(200).json({ ok: true });
  }),
);

export default router;
