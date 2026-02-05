// apps/api/src/routes/assistants.ts
import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AssistantCreate, AssistantUpdate, AssistantId } from '@dcm/types';
import { requireRole } from '../middlewares/auth';
import { assistantRepository } from '../repositories/assistantRepository';
import { sendZodValidationError } from '../lib/validation';

const router = express.Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

const handleValidationError = (req: Request, res: Response, issues: z.ZodError['issues']) =>
  sendZodValidationError(req, res, issues);

// Doctor can list; Admin/Reception can manage
router.get(
  '/',
  requireRole('DOCTOR', 'ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    const items = await assistantRepository.listActiveFirst();
    return res.status(200).json({ items });
  }),
);

router.post(
  '/',
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    const parsed = AssistantCreate.safeParse(req.body);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const created = await assistantRepository.create(parsed.data);
    return res.status(201).json(created);
  }),
);

router.patch(
  '/:assistantId',
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    const id = AssistantId.safeParse(req.params.assistantId);
    const body = AssistantUpdate.safeParse(req.body);
    if (!id.success || !body.success) {
      return handleValidationError(req, res, [
        ...(id.error?.issues ?? []),
        ...(body.error?.issues ?? []),
      ]);
    }

    const updated = await assistantRepository.update(id.data, body.data);
    if (!updated)
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Assistant not found' });

    return res.status(200).json(updated);
  }),
);

/**
 * ✅ NEW: DELETE /assistants/:assistantId
 * Allows Admin/Reception to delete an assistant.
 */
router.delete(
  '/:assistantId',
  requireRole('ADMIN', 'RECEPTION'),
  asyncHandler(async (req, res) => {
    const id = AssistantId.safeParse(req.params.assistantId);
    if (!id.success) return handleValidationError(req, res, id.error.issues);

    try {
      const ok = await assistantRepository.delete(id.data);
      if (!ok) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Assistant not found' });
      }
      // 204 No Content is standard for successful deletes
      return res.status(204).send();
    } catch (err: unknown) {
      // DynamoDB conditional delete throws if item doesn't exist
      if (
        typeof err === 'object' &&
        err !== null &&
        'name' in err &&
        (err as any).name === 'ConditionalCheckFailedException'
      ) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Assistant not found' });
      }
      throw err;
    }
  }),
);

export default router;
