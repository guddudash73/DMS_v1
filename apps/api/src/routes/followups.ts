import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { sendZodValidationError } from '../lib/validation';
import { logError } from '../lib/logger';
import { visitRepository } from '../repositories/visitRepository';
import { followupRepository } from '../repositories/followupRepository';
import { patientRepository } from '../repositories/patientRepository';
import { clinicDateISO } from '../lib/date';

const router = express.Router();

const DailyFollowupsQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format')
    .optional(),
});

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };

const handleValidationError = (req: Request, res: Response, issues: z.ZodError['issues']) =>
  sendZodValidationError(req, res, issues);

const todayIso = (): string => clinicDateISO();

router.get(
  '/daily',
  asyncHandler(async (req, res) => {
    const parsed = DailyFollowupsQuery.safeParse(req.query);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const date = parsed.data.date ?? todayIso();

    try {
      const followups = await followupRepository.listByFollowUpDate(date);

      const items: Array<{
        followupId: string;
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
      }> = [];

      for (const fu of followups) {
        const visit = await visitRepository.getById(fu.visitId);
        if (!visit) continue;

        const patient = await patientRepository.getById(visit.patientId);
        if (!patient || patient.isDeleted) continue;

        items.push({
          followupId: fu.followupId,
          visitId: fu.visitId,
          followUpDate: fu.followUpDate,
          reason: fu.reason,
          contactMethod: fu.contactMethod,
          status: fu.status,
          createdAt: fu.createdAt,
          updatedAt: fu.updatedAt,
          patientId: patient.patientId,
          patientName: patient.name,
          patientPhone: patient.phone || undefined,
        });
      }

      return res.status(200).json({ items });
    } catch (err) {
      logError('followups_daily_failed', {
        date,
        error: err instanceof Error ? err.message : String(err),
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
