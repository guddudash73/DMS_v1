// apps/api/src/routes/admin-rx-presets.ts
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/zod';
import {
  AdminCreateRxPresetRequest,
  AdminRxPresetSearchQuery,
  AdminUpdateRxPresetRequest,
  type AdminRxPresetListResponse,
} from '@dms/types';
import type { PrescriptionPresetId, RxLineType } from '@dms/types';
import { prescriptionPresetRepository } from '../repositories/prescriptionPresetRepository';
import { logAudit } from '../lib/logger';
import { sendZodValidationError } from '../lib/validation';
import { qNumber, qTrimmed } from '../lib/httpQuery';
import { pString } from '../lib/httpParams';

const r = Router();

const handleValidationError = (req: Request, res: Response, issues: z.ZodIssue[]) => {
  return sendZodValidationError(req, res, issues);
};

const buildAdminSearchFromRequest = (req: Request) => {
  const query = qTrimmed(req, 'query');
  const limit = qNumber(req, 'limit');
  const cursor = qTrimmed(req, 'cursor');

  const parsed = AdminRxPresetSearchQuery.safeParse({ query, limit, cursor });
  if (!parsed.success) throw parsed.error;
  return parsed.data;
};

r.get('/', async (req, res, next) => {
  try {
    let search: z.infer<typeof AdminRxPresetSearchQuery>;
    try {
      search = buildAdminSearchFromRequest(req);
    } catch (err) {
      if (err instanceof z.ZodError) return handleValidationError(req, res, err.issues);
      throw err;
    }

    const out = await prescriptionPresetRepository.searchAdmin(search);

    const payload: AdminRxPresetListResponse = {
      items: out.items,
      total: out.total,
      nextCursor: out.nextCursor,
    };

    return res.status(200).json(payload);
  } catch (err) {
    return next(err);
  }
});

r.post('/', validate(AdminCreateRxPresetRequest), async (req, res, next) => {
  try {
    const input = req.body as AdminCreateRxPresetRequest;

    const createdByUserId = req.auth?.userId ?? 'ADMIN';

    const created = await prescriptionPresetRepository.create({
      name: input.name,
      lines: input.lines,
      tags: input.tags,
      createdByUserId,
      scope: 'ADMIN',
    });

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'ADMIN_CREATE_RX_PRESET',
        entity: {
          type: 'RX_PRESET',
          id: created.id,
        },
        meta: {
          name: created.name,
          tags: created.tags ?? [],
        },
      });
    }

    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
});

r.patch('/:id', validate(AdminUpdateRxPresetRequest), async (req, res, next) => {
  try {
    const id = pString(req, 'id');
    if (!id) {
      return res.status(400).json({
        error: 'INVALID_RX_PRESET_ID',
        message: 'Rx preset id is required',
        traceId: req.requestId,
      });
    }

    const body = req.body as AdminUpdateRxPresetRequest;

    const patch: { name?: string; lines?: RxLineType[]; tags?: string[] } = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.lines !== undefined) patch.lines = body.lines;
    if (body.tags !== undefined) patch.tags = body.tags;

    const updated = await prescriptionPresetRepository.update(id as PrescriptionPresetId, patch);
    if (!updated) {
      return res.status(404).json({
        error: 'RX_PRESET_NOT_FOUND',
        message: 'Rx preset not found',
        traceId: req.requestId,
      });
    }

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'ADMIN_UPDATE_RX_PRESET',
        entity: {
          type: 'RX_PRESET',
          id,
        },
        meta: {
          name: updated.name,
          tags: updated.tags ?? [],
        },
      });
    }

    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
});

r.delete('/:id', async (req, res, next) => {
  try {
    const id = pString(req, 'id');
    if (!id) {
      return res.status(400).json({
        error: 'INVALID_RX_PRESET_ID',
        message: 'Rx preset id is required',
        traceId: req.requestId,
      });
    }

    const ok = await prescriptionPresetRepository.delete(id as PrescriptionPresetId);
    if (!ok) {
      return res.status(404).json({
        error: 'RX_PRESET_NOT_FOUND',
        message: 'Rx preset not found',
        traceId: req.requestId,
      });
    }

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'ADMIN_DELETE_RX_PRESET',
        entity: { type: 'RX_PRESET', id },
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

r.get('/:id', async (req, res, next) => {
  try {
    const id = pString(req, 'id');
    if (!id) {
      return res.status(400).json({
        error: 'INVALID_RX_PRESET_ID',
        message: 'Rx preset id is required',
        traceId: req.requestId,
      });
    }

    const preset = await prescriptionPresetRepository.getById(id as PrescriptionPresetId);
    if (!preset) {
      return res.status(404).json({
        error: 'RX_PRESET_NOT_FOUND',
        message: 'Rx preset not found',
        traceId: req.requestId,
      });
    }

    return res.status(200).json(preset);
  } catch (err) {
    return next(err);
  }
});

export default r;
