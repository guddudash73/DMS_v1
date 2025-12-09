// apps/api/src/routes/me.ts
import express, { type Request, type Response, type NextFunction } from 'express';
import type { ZodError } from 'zod';
import { UserPreferences } from '@dms/types';
import { userPreferencesRepository } from '../repositories/userPreferencesRepository';
import { sendZodValidationError } from '../lib/validation';

const router = express.Router();

const handleValidationError = (req: Request, res: Response, issues: ZodError['issues']) => {
  return sendZodValidationError(req, res, issues);
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

// GET /me/preferences  → returns current user's preferences (or {} if none)
router.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Authentication required.',
        traceId: req.requestId,
      });
    }

    const prefs = await userPreferencesRepository.getByUserId(auth.userId);

    // If no row yet, return an empty object (caller can treat as "no preferences set")
    return res.status(200).json(prefs ?? {});
  }),
);

// PUT /me/preferences  → upsert preferences for current user
router.put(
  '/preferences',
  asyncHandler(async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Authentication required.',
        traceId: req.requestId,
      });
    }

    const parsed = UserPreferences.safeParse(req.body);
    if (!parsed.success) {
      return handleValidationError(req, res, parsed.error.issues);
    }

    const saved = await userPreferencesRepository.saveForUser(auth.userId, parsed.data);
    return res.status(200).json(saved);
  }),
);

export default router;
