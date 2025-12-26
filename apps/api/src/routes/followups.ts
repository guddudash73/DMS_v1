import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { sendZodValidationError } from '../lib/validation';
import { logError } from '../lib/logger';
import { visitRepository } from '../repositories/visitRepository';
import { followupRepository } from '../repositories/followupRepository';
import { patientRepository } from '../repositories/patientRepository';

const router = express.Router();

const DailyFollowupsQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format')
    .optional(),
});

// ✅ must match packages/types FollowUpStatus
const FollowupStatusUpdateBody = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']),
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
  asyncHandler(async (req, res) => {
    const parsed = DailyFollowupsQuery.safeParse(req.query);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const date = parsed.data.date ?? todayIso();

    try {
      const visits = await visitRepository.listByDate(date);

      const items: FollowupListItem[] = [];

      for (const visit of visits) {
        const followup = await followupRepository.getByVisitId(visit.visitId);
        if (!followup) continue;

        // ✅ show only ACTIVE on the call list
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

router.patch(
  '/:visitId/status',
  asyncHandler(async (req, res) => {
    const visitId = req.params.visitId;

    const parsed = FollowupStatusUpdateBody.safeParse(req.body);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    try {
      const updated = await followupRepository.updateStatus(visitId as any, parsed.data);
      if (!updated) {
        return res.status(404).json({
          error: 'FOLLOWUP_NOT_FOUND',
          message: 'Followup not found for this visit.',
          traceId: req.requestId,
        });
      }

      return res.status(200).json({ followup: updated });
    } catch (err) {
      logError('followups_status_update_failed', {
        visitId,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : { message: String(err) },
      });

      return res.status(500).json({
        error: 'FOLLOWUPS_STATUS_UPDATE_FAILED',
        message: 'Unable to update followup status',
        traceId: req.requestId,
      });
    }
  }),
);

export default router;
