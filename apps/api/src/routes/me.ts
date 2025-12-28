import express, { type Request, type Response, type NextFunction } from 'express';
import type { ZodError } from 'zod';
import { UserPreferences } from '@dms/types';
import { userPreferencesRepository } from '../repositories/userPreferencesRepository';
import { userRepository } from '../repositories/userRepository';
import { sendZodValidationError } from '../lib/validation';

const router = express.Router();

const handleValidationError = (req: Request, res: Response, issues: ZodError['issues']) => {
  return sendZodValidationError(req, res, issues);
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

/**
 * GET /me
 * Returns the current authenticated user's profile.
 * - Always returns user fields.
 * - If the user is a DOCTOR, also returns their doctor profile (fullName etc.)
 *
 * This is intentionally NOT an admin endpoint and is safe for all authenticated roles.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Authentication required.',
        traceId: req.requestId,
      });
    }

    const user = await userRepository.getById(auth.userId);
    if (!user) {
      return res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'User not found.',
        traceId: req.requestId,
      });
    }

    // We know listDoctors() exists (used by /admin/doctors). We reuse it to fetch the current doctor's profile
    // without introducing new repository dependencies.
    let doctorProfile: {
      doctorId: string;
      fullName: string;
      registrationNumber: string;
      specialization: string;
      contact?: string;
      active: boolean;
      createdAt: number;
      updatedAt: number;
    } | null = null;

    if (auth.role === 'DOCTOR') {
      const doctors = await userRepository.listDoctors();
      const match = doctors.find((d) => d.doctorId === auth.userId);
      if (match) {
        doctorProfile = {
          doctorId: match.doctorId,
          fullName: match.fullName,
          registrationNumber: match.registrationNumber,
          specialization: match.specialization,
          contact: match.contact,
          active: match.active,
          createdAt: match.createdAt,
          updatedAt: match.updatedAt,
        };
      }
    }

    return res.status(200).json({
      userId: user.userId,
      role: user.role,
      email: user.email,
      displayName: user.displayName,
      active: user.active,
      doctorProfile,
    });
  }),
);

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

    return res.status(200).json(prefs ?? {});
  }),
);

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
