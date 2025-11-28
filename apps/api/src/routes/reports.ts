import express, { type Request, type Response, type NextFunction } from 'express';
import { DailyReportQuery } from '@dms/types';
import type { Patient } from '@dms/types';
import { visitRepository } from '../repositories/visitRepository';
import { patientRepository } from '../repositories/patientRepository';
import { billingRepository } from '../repositories/billingRepository';

const router = express.Router();

const handleValidationError = (res: Response, issues: unknown) => {
  return res.status(400).json({
    error: 'VALIDATION_ERROR',
    issues,
  });
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

router.get(
  '/daily',
  asyncHandler(async (req, res) => {
    const parsed = DailyReportQuery.safeParse(req.query);
    if (!parsed.success) {
      return handleValidationError(res, parsed.error.issues);
    }

    const { date } = parsed.data;

    const visits = await visitRepository.listByDate(date);

    const uniquePatientIds = Array.from(new Set(visits.map((v) => v.patientId)));
    const patientResults = await Promise.all(
      uniquePatientIds.map((id) => patientRepository.getById(id)),
    );

    const existingPatients = patientResults.filter((p): p is Patient => p !== null);
    const allowedPatientIds = new Set(existingPatients.map((p) => p.patientId));

    const filteredVisits = visits.filter((v) => allowedPatientIds.has(v.patientId));

    const billingResults = await Promise.all(
      filteredVisits.map((visit) => billingRepository.getByVisitId(visit.visitId)),
    );

    const visitCountsByStatus: { QUEUED: number; IN_PROGRESS: number; DONE: number } = {
      QUEUED: 0,
      IN_PROGRESS: 0,
      DONE: 0,
    };

    let totalRevenue = 0;
    const procedureCounts: Record<string, number> = {};

    for (let i = 0; i < filteredVisits.length; i++) {
      const visit = filteredVisits[i]!;
      const billing = billingResults[i] ?? null;

      if (visit.status in visitCountsByStatus) {
        visitCountsByStatus[visit.status]++;
      }

      if (typeof visit.billingAmount === 'number' && visit.billingAmount >= 0) {
        totalRevenue += visit.billingAmount;
      }

      if (billing && Array.isArray(billing.items)) {
        for (const line of billing.items) {
          const key = line.code ?? line.description;
          if (!key) continue;

          const current = procedureCounts[key] ?? 0;
          procedureCounts[key] = current + line.quantity;
        }
      }
    }

    return res.status(200).json({
      date,
      visitCountsByStatus,
      totalRevenue,
      procedureCounts,
    });
  }),
);

export default router;
