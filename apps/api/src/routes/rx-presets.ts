import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  PrescriptionPresetSearchQuery,
  CreateRxPresetRequest,
  UpdateRxPresetRequest,
  PrescriptionPresetId,
  type PrescriptionPresetScope,
} from '@dms/types';
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

function requireUser(req: Request): { userId: string; role?: string } {
  const u = req.auth;
  if (!u?.userId) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }
  return { userId: u.userId, role: u.role };
}

const buildPresetSearchFromRequest = (req: Request): PrescriptionPresetSearchQuery => {
  const query =
    typeof req.query.query === 'string' && req.query.query.trim().length > 0
      ? req.query.query
      : undefined;

  const limitRaw = req.query.limit;
  const limit = typeof limitRaw === 'string' && limitRaw.length > 0 ? Number(limitRaw) : undefined;

  const filter =
    typeof req.query.filter === 'string' && req.query.filter.trim().length > 0
      ? req.query.filter
      : undefined;

  const parsed = PrescriptionPresetSearchQuery.safeParse({
    query,
    limit,
    filter,
  });

  if (!parsed.success) throw parsed.error;
  return parsed.data;
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let search: PrescriptionPresetSearchQuery;
    try {
      search = buildPresetSearchFromRequest(req);
    } catch (err) {
      if (err instanceof z.ZodError) return handleValidationError(req, res, err.issues);
      throw err;
    }

    const user = requireUser(req);

    const presets = await prescriptionPresetRepository.search(search, user);

    return res.status(200).json({ items: presets });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = requireUser(req);

    const parsedId = PrescriptionPresetId.safeParse(req.params.id);
    if (!parsedId.success) return handleValidationError(req, res, parsedId.error.issues);

    const preset = await prescriptionPresetRepository.getById(parsedId.data);
    if (!preset) return res.status(404).json({ error: 'NOT_FOUND', message: 'Preset not found.' });

    if (user.role !== 'ADMIN') {
      const isOwner = preset.createdByUserId === user.userId;
      const isVisible = preset.scope === 'ADMIN' || preset.scope === 'PUBLIC' || isOwner;
      if (!isVisible) return res.status(403).json({ error: 'FORBIDDEN', message: 'Forbidden.' });
    }

    return res.status(200).json(preset);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const user = requireUser(req);

    if (user.role === 'RECEPTION') {
      return res
        .status(403)
        .json({ error: 'FORBIDDEN', message: 'Reception cannot create presets.' });
    }

    const parsed = CreateRxPresetRequest.safeParse(req.body);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const desiredScope: PrescriptionPresetScope = parsed.data.scope ?? 'PRIVATE';

    if (desiredScope === 'ADMIN' && user.role !== 'ADMIN') {
      return res
        .status(403)
        .json({ error: 'FORBIDDEN', message: 'Only admin can create admin presets.' });
    }

    const preset = await prescriptionPresetRepository.create({
      name: parsed.data.name,
      lines: parsed.data.lines,
      tags: parsed.data.tags,
      createdByUserId: user.userId,
      scope: desiredScope,
    });

    return res.status(201).json(preset);
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = requireUser(req);

    if (user.role === 'RECEPTION') {
      return res
        .status(403)
        .json({ error: 'FORBIDDEN', message: 'Reception cannot edit presets.' });
    }

    const parsedId = PrescriptionPresetId.safeParse(req.params.id);
    if (!parsedId.success) return handleValidationError(req, res, parsedId.error.issues);

    const parsedPatch = UpdateRxPresetRequest.safeParse(req.body);
    if (!parsedPatch.success) return handleValidationError(req, res, parsedPatch.error.issues);

    const existing = await prescriptionPresetRepository.getById(parsedId.data);
    if (!existing)
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Preset not found.' });

    const isOwner = existing.createdByUserId === user.userId;
    if (user.role !== 'ADMIN' && !isOwner) {
      return res
        .status(403)
        .json({ error: 'FORBIDDEN', message: 'You can only edit your own presets.' });
    }

    if (parsedPatch.data.scope === 'ADMIN' && user.role !== 'ADMIN') {
      return res
        .status(403)
        .json({ error: 'FORBIDDEN', message: 'Only admin can set ADMIN scope.' });
    }

    const updated = await prescriptionPresetRepository.update(parsedId.data, parsedPatch.data);
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND', message: 'Preset not found.' });

    return res.status(200).json(updated);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = requireUser(req);

    if (user.role === 'RECEPTION') {
      return res
        .status(403)
        .json({ error: 'FORBIDDEN', message: 'Reception cannot delete presets.' });
    }

    const parsedId = PrescriptionPresetId.safeParse(req.params.id);
    if (!parsedId.success) return handleValidationError(req, res, parsedId.error.issues);

    const existing = await prescriptionPresetRepository.getById(parsedId.data);
    if (!existing)
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Preset not found.' });

    const isOwner = existing.createdByUserId === user.userId;
    if (user.role !== 'ADMIN' && !isOwner) {
      return res
        .status(403)
        .json({ error: 'FORBIDDEN', message: 'You can only delete your own presets.' });
    }

    await prescriptionPresetRepository.delete(parsedId.data);
    return res.status(200).json({ ok: true });
  }),
);

export default router;
