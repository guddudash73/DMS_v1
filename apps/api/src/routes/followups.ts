import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { sendZodValidationError } from '../lib/validation';
import { logError } from '../lib/logger';
import { visitRepository } from '../repositories/visitRepository';
import { followupRepository } from '../repositories/followupRepository';
import { patientRepository } from '../repositories/patientRepository';
import { requireRole } from '../middlewares/auth';

const router = express.Router();

const DailyFollowupsQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format')
    .optional(),
});

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

const handleValidationError = (req: Request, res: Response, issues: z.ZodError['issues']) =>
  sendZodValidationError(req, res, issues);

const todayIso = (): string => new Date().toISOString().slice(0, 10);

type FollowupListItem = {
  visitId: string;
  followUpDate: string;
  reason?: string;
  contactMethod: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  patientId: string;
  patientName: string;
  patientPhone?: string;
};

router.get(
  '/daily',
  requireRole('RECEPTION', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = DailyFollowupsQuery.safeParse(req.query);
    if (!parsed.success) {
      return handleValidationError(req, res, parsed.error.issues);
    }

    const date = parsed.data.date ?? todayIso();

    try {
      // 1) All visits for the given date (uses existing GSI3)
      const visits = await visitRepository.listByDate(date);

      const items: FollowupListItem[] = [];

      for (const visit of visits) {
        const followup = await followupRepository.getByVisitId(visit.visitId);
        if (!followup) continue;
        if (followup.status !== 'ACTIVE') continue;

        const patient = await patientRepository.getById(visit.patientId);
        if (!patient || patient.isDeleted) continue;

        items.push({
          visitId: visit.visitId,
          followUpDate: followup.followUpDate,
          reason: followup.reason,
          contactMethod: followup.contactMethod,
          status: followup.status,
          createdAt: followup.createdAt,
          updatedAt: followup.updatedAt,
          patientId: patient.patientId,
          patientName: patient.name,
          patientPhone: patient.phone ?? undefined,
        });
      }

      return res.status(200).json({ items });
    } catch (err) {
      logError('followups_daily_failed', {
        date,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : { message: String(err) },
      });

      return res.status(500).json({
        error: 'FOLLOWUPS_DAILY_FAILED',
        message: 'Unable to load followups for the requested date',
        traceId: req.requestId,
      });
    }
  }),
);

export default router;
