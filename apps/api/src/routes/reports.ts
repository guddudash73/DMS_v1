import express, { type Request, type Response, type NextFunction } from 'express';
import {
  DailyReportQuery,
  DailyPatientSummaryRangeQuery,
  DailyVisitsBreakdownQuery,
  DoctorDailyVisitsBreakdownQuery,
  DoctorRecentCompletedQuery,
} from '@dms/types';
import type {
  Patient,
  DailyPatientSummary,
  DailyVisitsBreakdownResponse,
  DoctorDailyVisitsBreakdownResponse,
  DoctorRecentCompletedResponse,
} from '@dms/types';
import { visitRepository } from '../repositories/visitRepository';
import { patientRepository } from '../repositories/patientRepository';
import { billingRepository } from '../repositories/billingRepository';
import { userRepository } from '../repositories/userRepository';
import { type ZodError } from 'zod';
import { sendZodValidationError } from '../lib/validation';
import { prescriptionRepository } from '../repositories/prescriptionRepository';
import { xrayRepository } from '../repositories/xrayRepository';
import { clinicDateISO } from '../lib/date';

const router = express.Router();

const handleValidationError = (req: Request, res: Response, issues: ZodError['issues']) => {
  return sendZodValidationError(req, res, issues);
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d + days));

  const yy = dt.getUTCFullYear();
  const mm = pad2(dt.getUTCMonth() + 1);
  const dd = pad2(dt.getUTCDate());

  return `${yy}-${mm}-${dd}`;
}

function isValidISODate(dateISO: string): boolean {
  return ISO_DATE_RE.test(dateISO) && !Number.isNaN(Date.parse(`${dateISO}T00:00:00Z`));
}

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };

async function buildDailyPatientSummary(date: string): Promise<DailyPatientSummary> {
  const visits = await visitRepository.listByDate(date);

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
    }
  }

  const totalPatients = newPatients + followupPatients + zeroBilledVisits;

  return { date, newPatients, followupPatients, zeroBilledVisits, totalPatients };
}

router.get(
  '/daily',
  asyncHandler(async (req, res) => {
    const parsed = DailyReportQuery.safeParse(req.query);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

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
          procedureCounts[key] = (procedureCounts[key] ?? 0) + line.quantity;
        }
      }
    }

    return res.status(200).json({ date, visitCountsByStatus, totalRevenue, procedureCounts });
  }),
);

router.get(
  '/daily/patients',
  asyncHandler(async (req, res) => {
    const parsed = DailyReportQuery.safeParse(req.query);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const { date } = parsed.data;
    const summary = await buildDailyPatientSummary(date);
    return res.status(200).json(summary);
  }),
);

router.get(
  '/daily/patients/series',
  asyncHandler(async (req, res) => {
    const parsed = DailyPatientSummaryRangeQuery.safeParse(req.query);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const { startDate, endDate } = parsed.data;
    const points: DailyPatientSummary[] = [];

    if (!isValidISODate(startDate) || !isValidISODate(endDate) || startDate > endDate) {
      return res.status(200).json({ points });
    }

    let current = startDate;
    while (current <= endDate) {
      points.push(await buildDailyPatientSummary(current));
      current = addDaysISO(current, 1);
    }

    return res.status(200).json({ points });
  }),
);

router.get(
  '/daily/doctor/patients/series',
  asyncHandler(async (req, res) => {
    const parsed = DailyPatientSummaryRangeQuery.safeParse(req.query);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const doctorId = req.auth?.userId;
    if (!doctorId) return res.status(401).json({ error: 'Unauthorized' });

    const { startDate, endDate } = parsed.data;
    const points: DailyPatientSummary[] = [];

    if (!isValidISODate(startDate) || !isValidISODate(endDate) || startDate > endDate) {
      return res.status(200).json({ points });
    }

    // Build one day at a time, scoped to the authenticated doctor
    let current = startDate;
    while (current <= endDate) {
      const visits = await visitRepository.getDoctorQueue({ doctorId, date: current });

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
        }
      }

      const totalPatients = newPatients + followupPatients + zeroBilledVisits;

      points.push({
        date: current,
        newPatients,
        followupPatients,
        zeroBilledVisits,
        totalPatients,
      });

      current = addDaysISO(current, 1);
    }

    return res.status(200).json({ points });
  }),
);

router.get(
  '/daily/doctor/visits-breakdown',
  asyncHandler(async (req, res) => {
    const parsed = DoctorDailyVisitsBreakdownQuery.safeParse(req.query);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const doctorId = req.auth?.userId;
    if (!doctorId) return res.status(401).json({ error: 'Unauthorized' });

    const { date } = parsed.data;

    const doctorUser = await userRepository.getById(doctorId);
    const doctorName =
      doctorUser?.displayName || doctorUser?.email || `Doctor (${doctorId.slice(0, 6)})`;

    const visits = await visitRepository.getDoctorQueue({ doctorId, date });

    if (!visits.length) {
      const empty: DoctorDailyVisitsBreakdownResponse = {
        date,
        doctorId,
        doctorName,
        totalVisits: 0,
        items: [],
      };
      return res.status(200).json(empty);
    }

    const uniquePatientIds = Array.from(new Set(visits.map((v) => v.patientId)));
    const patientResults = await Promise.all(
      uniquePatientIds.map((id) => patientRepository.getById(id)),
    );
    const patientMap = new Map(patientResults.filter(Boolean).map((p) => [p!.patientId, p!]));

    const items = visits
      .map((v) => {
        const p = patientMap.get(v.patientId);
        if (!p) return null;

        return {
          visitId: v.visitId,
          visitDate: v.visitDate,
          status: v.status,
          tag: v.tag,
          reason: v.reason,
          billingAmount: v.billingAmount,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
          patientName: p.name,
          patientPhone: p.phone,
          patientGender: p.gender,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.createdAt - b.createdAt);

    const payload: DoctorDailyVisitsBreakdownResponse = {
      date,
      doctorId,
      doctorName,
      totalVisits: items.length,
      items,
    };

    return res.status(200).json(payload);
  }),
);

router.get(
  '/daily/visits-breakdown',
  asyncHandler(async (req, res) => {
    const parsed = DailyVisitsBreakdownQuery.safeParse(req.query);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const { date } = parsed.data;
    const visits = await visitRepository.listByDate(date);

    if (!visits.length) {
      const empty: DailyVisitsBreakdownResponse = { date, doctors: [], totalVisits: 0 };
      return res.status(200).json(empty);
    }

    const uniquePatientIds = Array.from(new Set(visits.map((v) => v.patientId)));
    const patientResults = await Promise.all(
      uniquePatientIds.map((id) => patientRepository.getById(id)),
    );
    const patientMap = new Map(patientResults.filter(Boolean).map((p) => [p!.patientId, p!]));

    const uniqueDoctorIds = Array.from(new Set(visits.map((v) => v.doctorId)));
    const doctorUsers = await Promise.all(uniqueDoctorIds.map((id) => userRepository.getById(id)));

    const doctorNameMap = new Map<string, string>();
    for (let i = 0; i < uniqueDoctorIds.length; i++) {
      const id = uniqueDoctorIds[i]!;
      const u = doctorUsers[i];
      const name = u?.displayName || u?.email || `Doctor (${id.slice(0, 6)})`;
      doctorNameMap.set(id, name);
    }

    const normalized = visits
      .map((v) => {
        const p = patientMap.get(v.patientId);
        if (!p) return null;

        const doctorName = doctorNameMap.get(v.doctorId) ?? `Doctor (${v.doctorId.slice(0, 6)})`;

        return {
          visitId: v.visitId,
          visitDate: v.visitDate,
          status: v.status,
          tag: v.tag,
          reason: v.reason,
          billingAmount: v.billingAmount,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,

          patientId: p.patientId,
          patientName: p.name,
          patientPhone: p.phone,
          patientGender: p.gender,

          doctorId: v.doctorId,
          doctorName,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const byDoctor = new Map<string, typeof normalized>();
    for (const item of normalized) {
      const arr = byDoctor.get(item.doctorId) ?? [];
      arr.push(item);
      byDoctor.set(item.doctorId, arr);
    }

    const doctors = Array.from(byDoctor.entries()).map(([doctorId, items]) => {
      const doctorName = doctorNameMap.get(doctorId) ?? `Doctor (${doctorId.slice(0, 6)})`;
      return {
        doctorId,
        doctorName,
        total: items.length,
        items: items.sort((a, b) => a.createdAt - b.createdAt),
      };
    });

    doctors.sort((a, b) => b.total - a.total);

    const payload: DailyVisitsBreakdownResponse = {
      date,
      doctors,
      totalVisits: normalized.length,
    };

    return res.status(200).json(payload);
  }),
);

router.get(
  '/daily/doctor/recent-completed',
  asyncHandler(async (req, res) => {
    const parsed = DoctorRecentCompletedQuery.safeParse(req.query);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const doctorId = req.auth?.userId;
    if (!doctorId) return res.status(401).json({ error: 'Unauthorized' });

    const todayIso = clinicDateISO();
    const date = parsed.data.date ?? todayIso;
    const limit = parsed.data.limit ?? 5;

    const visits = await visitRepository.getDoctorQueue({ doctorId, date });

    const done = visits
      .filter((v) => v.status === 'DONE')
      .slice()
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
      .slice(0, limit);

    if (done.length === 0) {
      const empty: DoctorRecentCompletedResponse = { date, doctorId, items: [] };
      return res.status(200).json(empty);
    }

    const patientIds = Array.from(new Set(done.map((v) => v.patientId)));
    const patients = await Promise.all(patientIds.map((id) => patientRepository.getById(id)));
    const patientMap = new Map(patients.filter(Boolean).map((p) => [p!.patientId, p!]));

    const items = await Promise.all(
      done.map(async (v) => {
        const p = patientMap.get(v.patientId);
        if (!p) return null;

        const [rxList, xrayList] = await Promise.all([
          prescriptionRepository.listByVisit(v.visitId),
          xrayRepository.listByVisit(v.visitId),
        ]);

        return {
          visitId: v.visitId,
          patientId: v.patientId,
          patientName: p.name,
          hasRx: rxList.length > 0,
          hasXray: xrayList.length > 0,
        };
      }),
    );

    const payload: DoctorRecentCompletedResponse = {
      date,
      doctorId,
      items: items.filter((x): x is NonNullable<typeof x> => x !== null),
    };

    return res.status(200).json(payload);
  }),
);

export default router;
