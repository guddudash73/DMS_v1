import express, { type Request, type Response, type NextFunction } from 'express';
import type { ZodError } from 'zod';
import { UpdateMeRequest, UserPreferences } from '@dms/types';
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

async function buildMeResponse(args: { userId: string; role: string }) {
  const user = await userRepository.getById(args.userId);
  if (!user) return null;

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

  if (args.role === 'DOCTOR') {
    const doctors = await userRepository.listDoctors();
    const match = doctors.find((d) => d.doctorId === args.userId);
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

  return {
    userId: user.userId,
    role: user.role,
    email: user.email,
    displayName: user.displayName,
    active: user.active,
    doctorProfile,
  };
}

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

    const payload = await buildMeResponse({ userId: auth.userId, role: auth.role });
    if (!payload) {
      return res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'User not found.',
        traceId: req.requestId,
      });
    }

    return res.status(200).json(payload);
  }),
);

router.patch(
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

    const parsed = UpdateMeRequest.safeParse(req.body);
    if (!parsed.success) {
      return handleValidationError(req, res, parsed.error.issues);
    }

    const { displayName, doctorProfile } = parsed.data;

    if (displayName !== undefined) {
      await userRepository.updateUser(auth.userId, { displayName });
    }

    if (doctorProfile && auth.role === 'DOCTOR') {
      const patch: { contact?: string; fullName?: string } = {};
      if (doctorProfile.contact !== undefined) patch.contact = doctorProfile.contact;
      if (doctorProfile.fullName !== undefined) patch.fullName = doctorProfile.fullName;

      if (Object.keys(patch).length > 0) {
        await userRepository.updateDoctorProfile(auth.userId, patch);
      }
    }

    const payload = await buildMeResponse({ userId: auth.userId, role: auth.role });
    if (!payload) {
      return res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'User not found.',
        traceId: req.requestId,
      });
    }

    return res.status(200).json(payload);
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
