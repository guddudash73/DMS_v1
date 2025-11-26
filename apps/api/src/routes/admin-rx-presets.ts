// apps/api/src/routes/admin-rx-presets.ts
import { Router } from 'express';
import { validate } from '../middlewares/zod';
import { AdminCreateRxPresetRequest, AdminUpdateRxPresetRequest } from '@dms/types';
import type { PrescriptionPresetId, RxLineType } from '@dms/types';
import { prescriptionPresetRepository } from '../repositories/prescriptionPresetRepository';

const r = Router();

r.post('/', validate(AdminCreateRxPresetRequest), async (req, res, next) => {
  try {
    const input = req.body as AdminCreateRxPresetRequest;

    const createParams: {
      name: string;
      lines: RxLineType[];
      tags?: string[];
      createdByUserId: string;
    } = {
      name: input.name,
      lines: input.lines,
      createdByUserId: 'ADMIN', // TODO: replace with req.auth.userId once wired
    };

    if (input.tags !== undefined) {
      createParams.tags = input.tags;
    }

    const created = await prescriptionPresetRepository.create(createParams);

    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
});

r.patch('/:id', validate(AdminUpdateRxPresetRequest), async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: 'INVALID_RX_PRESET_ID' });
    }

    const body = req.body as AdminUpdateRxPresetRequest;

    const patch: { name?: string; lines?: RxLineType[]; tags?: string[] } = {};

    if (body.name !== undefined) {
      patch.name = body.name;
    }
    if (body.lines !== undefined) {
      patch.lines = body.lines;
    }
    if (body.tags !== undefined) {
      patch.tags = body.tags;
    }

    const updated = await prescriptionPresetRepository.update(id as PrescriptionPresetId, patch);
    if (!updated) {
      return res.status(404).json({ error: 'RX_PRESET_NOT_FOUND' });
    }

    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
});

export default r;
