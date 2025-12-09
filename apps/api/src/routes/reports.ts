// apps/api/src/routes/reports.ts
import express, { type Request, type Response, type NextFunction } from 'express';
import { DailyReportQuery, DailyPatientSummaryRangeQuery } from '@dms/types';
import type { Patient, DailyPatientSummary } from '@dms/types';
import { visitRepository } from '../repositories/visitRepository';
import { patientRepository } from '../repositories/patientRepository';
import { billingRepository } from '../repositories/billingRepository';
import { type ZodError } from 'zod';
import { sendZodValidationError } from '../lib/validation';

const router = express.Router();

const handleValidationError = (req: Request, res: Response, issues: ZodError['issues']) => {
  return sendZodValidationError(req, res, issues);
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

// --- Helper: build a DailyPatientSummary for a single date ---
async function buildDailyPatientSummary(date: string): Promise<DailyPatientSummary> {
  const visits = await visitRepository.listByDate(date);

  // Reuse the "existing patients only" rule from the daily report
  const uniquePatientIds = Array.from(new Set(visits.map((v) => v.patientId)));
  const patientResults = await Promise.all(
    uniquePatientIds.map((id) => patientRepository.getById(id)),
  );

  const existingPatients = patientResults.filter((p): p is Patient => p !== null);
  const allowedPatientIds = new Set(existingPatients.map((p) => p.patientId));

  const filteredVisits = visits.filter((v) => allowedPatientIds.has(v.patientId));

  let newPatients = 0;
  let followupPatients = 0;
  let zeroBilledVisits = 0;

  for (const visit of filteredVisits) {
    switch (visit.tag) {
      case 'N':
        newPatients++;
        break;
      case 'F':
        followupPatients++;
        break;
      case 'Z':
        zeroBilledVisits++;
        break;
      default:
      // visits created before tags existed – ignored for tag-based metrics
    }
  }

  const totalPatients = newPatients + followupPatients + zeroBilledVisits;

  return {
    date,
    newPatients,
    followupPatients,
    zeroBilledVisits,
    totalPatients,
  };
}

router.get(
  '/daily',
  asyncHandler(async (req, res) => {
    const parsed = DailyReportQuery.safeParse(req.query);
    if (!parsed.success) {
      return handleValidationError(req, res, parsed.error.issues);
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
        visitCountsByStatus[visit.status as keyof typeof visitCountsByStatus]++;
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

router.get(
  '/daily/patients',
  asyncHandler(async (req, res) => {
    const parsed = DailyReportQuery.safeParse(req.query);
    if (!parsed.success) {
      return handleValidationError(req, res, parsed.error.issues);
    }

    const { date } = parsed.data;

    const summary = await buildDailyPatientSummary(date);

    return res.status(200).json(summary);
  }),
);

// NEW: Daily patients time series – used by VisitorsRatioChart
router.get(
  '/daily/patients/series',
  asyncHandler(async (req, res) => {
    const parsed = DailyPatientSummaryRangeQuery.safeParse(req.query);
    if (!parsed.success) {
      return handleValidationError(req, res, parsed.error.issues);
    }

    const { startDate, endDate } = parsed.data;

    const points: DailyPatientSummary[] = [];

    const start = new Date(startDate);
    const end = new Date(endDate);

    // If invalid or reversed range, just return empty series
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return res.status(200).json({ points });
    }

    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      // reuse the same computation used by /daily/patients
      // eslint-disable-next-line no-await-in-loop
      const summary = await buildDailyPatientSummary(dateStr);
      points.push(summary);
      current.setDate(current.getDate() + 1);
    }

    return res.status(200).json({ points });
  }),
);

export default router;
