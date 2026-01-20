import express, { type Request, type Response, type NextFunction } from 'express';
import {
  DailyReportQuery,
  DailyPatientSummaryRangeQuery,
  DailyVisitsBreakdownQuery,
  RecentCompletedQuery,
  DailyPaymentsBreakdownQuery,
} from '@dcm/types';
import type {
  Patient,
  DailyPatientSummary,
  DailyVisitsBreakdownResponse,
  RecentCompletedResponse,
} from '@dcm/types';

import { visitRepository } from '../repositories/visitRepository';
import { patientRepository } from '../repositories/patientRepository';
import { billingRepository } from '../repositories/billingRepository';
import { prescriptionRepository } from '../repositories/prescriptionRepository';
import { xrayRepository } from '../repositories/xrayRepository';

import { type ZodError } from 'zod';
import { sendZodValidationError } from '../lib/validation';
import { clinicDateISO } from '../lib/date';

import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

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
    if (visit.tag === 'N') newPatients++;
    else if (visit.tag === 'F') followupPatients++;

    if (visit.zeroBilled === true) zeroBilledVisits++;
  }

  const totalPatients = newPatients + followupPatients;
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
    let onlineReceivedTotal = 0;
    let offlineReceivedTotal = 0;

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

      if (billing) {
        const amt = typeof billing.total === 'number' && billing.total >= 0 ? billing.total : 0;
        if (billing.receivedOnline === true) onlineReceivedTotal += amt;
        if (billing.receivedOffline === true) offlineReceivedTotal += amt;

        if (Array.isArray(billing.items)) {
          for (const line of billing.items) {
            const key = line.code ?? line.description;
            if (!key) continue;
            procedureCounts[key] = (procedureCounts[key] ?? 0) + line.quantity;
          }
        }
      }
    }

    return res.status(200).json({
      date,
      visitCountsByStatus,
      totalRevenue,
      onlineReceivedTotal,
      offlineReceivedTotal,
      procedureCounts,
    });
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
  '/daily/visits-breakdown',
  asyncHandler(async (req, res) => {
    const parsed = DailyVisitsBreakdownQuery.safeParse(req.query);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const { date } = parsed.data;
    const visits = await visitRepository.listByDate(date);

    if (!visits.length) {
      const empty: DailyVisitsBreakdownResponse = { date, totalVisits: 0, items: [] };
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
          zeroBilled:
            (v as typeof v & { zeroBilled?: boolean }).zeroBilled === true ? true : undefined,
          reason: v.reason,
          billingAmount: v.billingAmount,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,

          patientId: p.patientId,
          patientName: p.name,
          patientPhone: p.phone,
          patientGender: p.gender,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.createdAt - b.createdAt);

    const payload: DailyVisitsBreakdownResponse = {
      date,
      totalVisits: items.length,
      items,
    };

    return res.status(200).json(payload);
  }),
);

router.get(
  '/daily/recent-completed',
  asyncHandler(async (req, res) => {
    const parsed = RecentCompletedQuery.safeParse(req.query);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const todayIso = clinicDateISO();
    const date = parsed.data.date ?? todayIso;
    const limit = parsed.data.limit ?? 5;

    const visits = await visitRepository.listByDate(date);

    const done = visits
      .filter((v) => v.status === 'DONE')
      .slice()
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
      .slice(0, limit);

    if (done.length === 0) {
      const empty: RecentCompletedResponse = { date, items: [] };
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

    const payload: RecentCompletedResponse = {
      date,
      items: items.filter((x): x is NonNullable<typeof x> => x !== null),
    };

    return res.status(200).json(payload);
  }),
);

router.get(
  '/daily/payments-breakdown',
  asyncHandler(async (req, res) => {
    const parsed = DailyPaymentsBreakdownQuery.safeParse(req.query);
    if (!parsed.success) return handleValidationError(req, res, parsed.error.issues);

    const { date } = parsed.data;
    const visits = await visitRepository.listByDate(date);

    if (!visits.length) {
      return res.status(200).json({
        date,
        totals: { total: 0, online: 0, offline: 0, other: 0 },
        items: [],
      });
    }

    const uniquePatientIds = Array.from(new Set(visits.map((v) => v.patientId)));
    const patientResults = await Promise.all(
      uniquePatientIds.map((id) => patientRepository.getById(id)),
    );
    const patientMap = new Map(patientResults.filter(Boolean).map((p) => [p!.patientId, p!]));

    const billingResults = await Promise.all(
      visits.map((v) => billingRepository.getByVisitId(v.visitId)),
    );

    let online = 0;
    let offline = 0;
    let other = 0;

    const items = visits
      .map((v, idx) => {
        const p = patientMap.get(v.patientId);
        if (!p) return null;

        const billing = billingResults[idx] ?? null;

        const amount =
          billing && typeof billing.total === 'number' && billing.total >= 0
            ? billing.total
            : typeof v.billingAmount === 'number' && v.billingAmount >= 0
              ? v.billingAmount
              : 0;

        const hasPayment = Boolean(billing) || amount > 0;
        if (!hasPayment) return null;

        let paymentMode: 'ONLINE' | 'OFFLINE' | 'OTHER' = 'OTHER';
        if (billing?.receivedOnline === true) paymentMode = 'ONLINE';
        else if (billing?.receivedOffline === true) paymentMode = 'OFFLINE';

        if (paymentMode === 'ONLINE') online += amount;
        else if (paymentMode === 'OFFLINE') offline += amount;
        else other += amount;

        return {
          visitId: v.visitId,
          visitDate: v.visitDate,
          status: v.status,
          tag: v.tag,
          zeroBilled:
            (v as typeof v & { zeroBilled?: boolean }).zeroBilled === true ? true : undefined,
          reason: v.reason,
          billingAmount: amount,
          paymentMode,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,

          patientId: p.patientId,
          patientName: p.name,
          patientPhone: p.phone,
          patientGender: p.gender,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    return res.status(200).json({
      date,
      totals: { total: online + offline + other, online, offline, other },
      items,
    });
  }),
);

router.get(
  '/daily/pdf',
  asyncHandler(async (req, res) => {
    const date =
      typeof req.query.date === 'string' && req.query.date.length > 0
        ? req.query.date
        : clinicDateISO();

    if (!isValidISODate(date)) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid date' });
    }

    const [visits, patientSummary] = await Promise.all([
      visitRepository.listByDate(date),
      buildDailyPatientSummary(date),
    ]);

    const uniquePatientIds = Array.from(new Set(visits.map((v) => v.patientId)));
    const patientResults = await Promise.all(
      uniquePatientIds.map((id) => patientRepository.getById(id)),
    );
    const patientMap = new Map(patientResults.filter(Boolean).map((p) => [p!.patientId, p!]));

    const billingResults = await Promise.all(
      visits.map((v) => billingRepository.getByVisitId(v.visitId)),
    );

    const visitCountsByStatus: { QUEUED: number; IN_PROGRESS: number; DONE: number } = {
      QUEUED: 0,
      IN_PROGRESS: 0,
      DONE: 0,
    };

    let totalRevenue = 0;
    const procedureCounts: Record<string, number> = {};

    let payOnline = 0;
    let payOffline = 0;
    let payOther = 0;

    const fmtTime = (ts: number) =>
      new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).format(
        new Date(ts),
      );

    for (let i = 0; i < visits.length; i++) {
      const v = visits[i]!;
      const p = patientMap.get(v.patientId);
      if (!p) continue;

      if (v.status in visitCountsByStatus) {
        visitCountsByStatus[v.status as keyof typeof visitCountsByStatus]++;
      }

      if (typeof v.billingAmount === 'number' && v.billingAmount >= 0)
        totalRevenue += v.billingAmount;

      const billing = billingResults[i] ?? null;
      if (billing && Array.isArray(billing.items)) {
        for (const line of billing.items) {
          const key = line.code ?? line.description;
          if (!key) continue;
          procedureCounts[key] = (procedureCounts[key] ?? 0) + line.quantity;
        }
      }
    }

    const paymentsItems = visits
      .map((v, idx) => {
        const p = patientMap.get(v.patientId);
        if (!p) return null;

        const billing = billingResults[idx] ?? null;

        const amount =
          billing && typeof billing.total === 'number' && billing.total >= 0
            ? billing.total
            : typeof v.billingAmount === 'number' && v.billingAmount >= 0
              ? v.billingAmount
              : 0;

        const hasPayment = Boolean(billing) || amount > 0;
        if (!hasPayment) return null;

        let mode: 'ONLINE' | 'OFFLINE' | 'OTHER' = 'OTHER';
        if (billing?.receivedOnline === true) mode = 'ONLINE';
        else if (billing?.receivedOffline === true) mode = 'OFFLINE';

        if (mode === 'ONLINE') payOnline += amount;
        else if (mode === 'OFFLINE') payOffline += amount;
        else payOther += amount;

        return {
          createdAt: v.createdAt,
          timeLabel: fmtTime(v.createdAt),
          patientName: p.name ?? '—',
          reason: v.reason ?? '—',
          tag: v.tag ?? '—',
          mode,
          amount,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.createdAt - b.createdAt);

    const procedureRows = Object.entries(procedureCounts)
      .map(([name, count]) => ({ name, count: typeof count === 'number' ? count : 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="daily-report-${date}.pdf"`);

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 44, bottom: 44, left: 44, right: 44 },
      compress: true,
    });

    doc.pipe(res);

    // ✅ Lambda-safe font loading:
    // - In prod (Lambda), fonts should be packaged under: /var/task/assets/fonts
    //   which appears as: path.join(process.cwd(), 'assets', 'fonts')
    // - In dev (local), keep your existing fallback path.
    const fontsCandidates = [
      path.join(process.cwd(), 'assets', 'fonts'),
      path.join(__dirname, 'assets', 'fonts'),
      path.join(process.cwd(), 'apps', 'api', 'src', 'assets', 'fonts'), // dev fallback
    ];

    const pickFontsDir = () => {
      for (const dir of fontsCandidates) {
        if (fs.existsSync(dir)) return dir;
      }
      return null;
    };

    const fontsDir = pickFontsDir();
    const fontRegularPath = fontsDir ? path.join(fontsDir, 'NotoSans-Regular.ttf') : null;
    const fontBoldPath = fontsDir ? path.join(fontsDir, 'NotoSans-Bold.ttf') : null;

    let hasFonts = false;

    try {
      if (fontRegularPath && fontBoldPath) {
        doc.registerFont('AppFont', fontRegularPath);
        doc.registerFont('AppFont-Bold', fontBoldPath);
        hasFonts = true;
      }
    } catch {
      // ✅ If fonts are missing or unreadable, don't crash the request.
      // PDF still generates using built-in Helvetica.
      hasFonts = false;
    }

    const font = (w: 'regular' | 'bold') => {
      if (!hasFonts) return w === 'bold' ? doc.font('Helvetica-Bold') : doc.font('Helvetica');
      return w === 'bold' ? doc.font('AppFont-Bold') : doc.font('AppFont');
    };

    const left = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottomY = () => doc.page.height - doc.page.margins.bottom;

    const ensureSpace = (need: number) => {
      if (doc.y + need <= bottomY()) return;
      doc.addPage();
    };

    const hr = () => {
      ensureSpace(12);
      const y = doc.y;
      doc
        .save()
        .strokeColor('#E5E7EB')
        .lineWidth(1)
        .moveTo(left, y)
        .lineTo(left + usableWidth, y)
        .stroke()
        .restore();
      doc.moveDown(0.9);
      doc.x = left;
    };

    const formatINR = (n: number) => {
      const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
      const amt = v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return hasFonts ? `₹${amt}` : `INR ${amt}`;
    };

    const sectionTitle = (label: string) => {
      ensureSpace(26);
      doc.x = left;
      font('bold').fontSize(14).fillColor('#111827');
      doc.text(label, left, doc.y);
      doc.moveDown(0.35);
      doc.x = left;
    };

    const kv = (k: string, v: string) => {
      ensureSpace(16);
      doc.x = left;
      font('regular')
        .fontSize(11)
        .fillColor('#111827')
        .text(`${k}: `, left, doc.y, { continued: true });
      font('bold').fontSize(11).fillColor('#111827').text(v);
      doc.x = left;
    };

    type Col = {
      key: string;
      title: string;
      width: number;
      align?: 'left' | 'right' | 'center';
      wrap?: boolean;
      maxLines?: number;
    };

    const truncateToWidth = (text: string, maxW: number) => {
      const t = text ?? '';
      if (t.length === 0) return t;
      if (doc.widthOfString(t) <= maxW) return t;

      const ell = '…';
      const ellW = doc.widthOfString(ell);
      if (ellW >= maxW) return '';

      let lo = 0;
      let hi = t.length;
      let best = ell;

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const cand = t.slice(0, mid) + ell;
        if (doc.widthOfString(cand) <= maxW) {
          best = cand;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return best;
    };

    const clampToLines = (text: string, width: number, fontSize: number, maxLines: number) => {
      const raw = text ?? '';
      if (!raw) return raw;

      const h = doc.heightOfString(raw, { width });
      const lineH = doc.currentLineHeight(true);
      const lines = Math.ceil(h / Math.max(1, lineH));
      if (lines <= maxLines) return raw;

      const ell = '…';
      let lo = 0;
      let hi = raw.length;
      let best = ell;

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const cand = raw.slice(0, mid).trimEnd() + ell;
        const candH = doc.heightOfString(cand, { width });
        const candLines = Math.ceil(candH / Math.max(1, lineH));

        if (candLines <= maxLines) {
          best = cand;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      return best;
    };

    const drawTable = (
      columns: Col[],
      rows: Record<string, unknown>[],
      opts?: { fontSize?: number },
    ) => {
      const headerH = 26;
      const fontSize = opts?.fontSize ?? 10;
      const padX = 6;
      const padY = 7;

      const drawHeader = () => {
        ensureSpace(headerH + 8);
        const y0 = doc.y;

        doc.save();
        doc.rect(left, y0, usableWidth, headerH).fill('#F3F4F6');
        doc.restore();

        doc.save();
        doc
          .strokeColor('#E5E7EB')
          .lineWidth(1)
          .moveTo(left, y0 + headerH)
          .lineTo(left + usableWidth, y0 + headerH)
          .stroke();
        doc.restore();

        let x = left;
        font('bold').fontSize(fontSize).fillColor('#111827');
        for (const c of columns) {
          const cellW = c.width - padX * 2;
          const title = truncateToWidth(String(c.title), cellW);
          doc.text(title, x + padX, y0 + 8, {
            width: cellW,
            align: c.align ?? 'left',
            lineBreak: false,
          });
          x += c.width;
        }

        doc.y = y0 + headerH;
        doc.x = left;
      };

      // Lint-only fix: removed unused `row` param (behavior unchanged).
      const measureRowHeight = () => {
        font('regular').fontSize(fontSize);
        const lineH = doc.currentLineHeight(true);

        const heights = columns.map((c) => {
          const wrap = c.wrap !== false && (c.align ?? 'left') === 'left';
          if (!wrap) return fontSize + 4;

          const maxLines = c.maxLines ?? 2;
          return Math.max(lineH, maxLines * lineH);
        });

        return Math.max(...heights) + padY * 2;
      };

      const drawRow = (row: Record<string, unknown>) => {
        const rowH = measureRowHeight();

        if (doc.y + rowH > bottomY()) {
          doc.addPage();
          drawHeader();
        }

        const y0 = doc.y;

        doc.save();
        doc
          .strokeColor('#F3F4F6')
          .lineWidth(1)
          .moveTo(left, y0 + rowH)
          .lineTo(left + usableWidth, y0 + rowH)
          .stroke();
        doc.restore();

        let x = left;
        font('regular').fontSize(fontSize).fillColor('#111827');

        for (const c of columns) {
          const raw = row[c.key];
          const textRaw = raw === null || raw === undefined ? '' : String(raw);

          const cellW = c.width - padX * 2;
          const wrap = c.wrap !== false && (c.align ?? 'left') === 'left';

          let textToDraw = textRaw;

          if (wrap) {
            const maxLines = c.maxLines ?? 2;
            textToDraw = clampToLines(textRaw, cellW, fontSize, maxLines);
          } else {
            textToDraw = truncateToWidth(textRaw, cellW);
          }

          doc.text(textToDraw, x + padX, y0 + padY, {
            width: cellW,
            align: c.align ?? 'left',
            lineBreak: wrap,
          });

          x += c.width;
        }

        doc.y = y0 + rowH;
        doc.x = left;
      };

      drawHeader();
      for (const r of rows) drawRow(r);
      doc.moveDown(0.7);
      doc.x = left;
    };

    const colsProcedures = (): Col[] => {
      const wCount = 90;
      const wProc = usableWidth - wCount;
      return [
        {
          key: 'proc',
          title: 'Procedure / Code',
          width: wProc,
          align: 'left',
          wrap: true,
          maxLines: 2,
        },
        { key: 'count', title: 'Count', width: wCount, align: 'right', wrap: false },
      ];
    };

    const colsPaymentsWithTag = (): Col[] => {
      const wTime = 74;
      const wTag = 38;
      const wMode = 70;
      const wAmount = 128;

      const fixed = wTime + wTag + wMode + wAmount;
      const remaining = Math.max(0, usableWidth - fixed);

      let wPatient = Math.floor(remaining * 0.62);
      let wReason = remaining - wPatient;

      const minPatient = 120;
      const minReason = 90;

      if (remaining < minPatient + minReason) {
        wPatient = Math.max(90, Math.floor(remaining * 0.58));
        wReason = remaining - wPatient;
        if (wReason < 70) {
          wReason = 70;
          wPatient = remaining - wReason;
        }
      } else {
        wPatient = Math.max(minPatient, wPatient);
        wReason = Math.max(minReason, wReason);
        const over = wPatient + wReason - remaining;
        if (over > 0) {
          const takeFromReason = Math.min(over, wReason - minReason);
          wReason -= takeFromReason;
          const leftOver = over - takeFromReason;
          if (leftOver > 0) wPatient = Math.max(minPatient, wPatient - leftOver);
          wReason = remaining - wPatient;
        }
      }

      wReason = Math.max(60, wReason);
      wPatient = Math.max(60, remaining - wReason);
      wReason = remaining - wPatient;

      return [
        { key: 'time', title: 'Time', width: wTime, align: 'left', wrap: false },
        {
          key: 'patient',
          title: 'Patient',
          width: wPatient,
          align: 'left',
          wrap: true,
          maxLines: 2,
        },
        { key: 'reason', title: 'Reason', width: wReason, align: 'left', wrap: true, maxLines: 2 },
        { key: 'tag', title: 'Tag', width: wTag, align: 'center', wrap: false },
        { key: 'mode', title: 'Mode', width: wMode, align: 'center', wrap: false },
        { key: 'amount', title: 'Amount', width: wAmount, align: 'right', wrap: false },
      ];
    };

    font('bold').fontSize(22).fillColor('#111827');
    doc.text('Daily Clinic Report', left, doc.y);
    doc.moveDown(0.35);

    font('regular').fontSize(11).fillColor('#374151');
    doc.text(`Date: ${date}`, left, doc.y);
    doc.text(
      `Generated: ${new Intl.DateTimeFormat('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(new Date())}`,
      left,
      doc.y,
    );

    doc.moveDown(0.6);
    hr();

    sectionTitle('Summary');

    const queued = visitCountsByStatus.QUEUED ?? 0;
    const onChair = visitCountsByStatus.IN_PROGRESS ?? 0;
    const done = visitCountsByStatus.DONE ?? 0;
    const totalVisits = queued + onChair + done;

    kv('Visits', `${totalVisits} (Queued ${queued}, On-chair ${onChair}, Done ${done})`);
    kv(
      'Visitors',
      `${patientSummary.totalPatients} (New ${patientSummary.newPatients}, Follow-up ${patientSummary.followupPatients})`,
    );
    kv('Zero billed', `${patientSummary.zeroBilledVisits}`);

    kv('Total revenue (from visits)', `${formatINR(totalRevenue)}`);
    ensureSpace(30);
    doc.x = left;
    font('regular')
      .fontSize(10)
      .fillColor('#374151')
      .text(
        `(Online ${formatINR(payOnline)} • Offline ${formatINR(payOffline)} • Other ${formatINR(payOther)})`,
        left,
        doc.y,
      );

    doc.moveDown(0.6);
    hr();

    sectionTitle('Procedures');

    if (procedureRows.length === 0) {
      font('regular').fontSize(10).fillColor('#6B7280');
      doc.text('No procedures found for this day.', left, doc.y);
      doc.moveDown(0.6);
    } else {
      drawTable(
        colsProcedures(),
        procedureRows.map((p) => ({
          proc: p.name,
          count: String(p.count),
        })),
      );
    }

    doc.moveDown(0.6);

    sectionTitle('Payments breakdown');

    if (paymentsItems.length === 0) {
      font('regular').fontSize(10).fillColor('#6B7280');
      doc.text('No checked-out payments found for this day.', left, doc.y);
      doc.moveDown(0.6);
    } else {
      drawTable(
        colsPaymentsWithTag(),
        paymentsItems.map((x) => ({
          time: x.timeLabel,
          patient: x.patientName,
          reason: x.reason,
          tag: x.tag,
          mode: x.mode,
          amount: formatINR(x.amount),
        })),
        { fontSize: 9 },
      );
    }

    doc.end();
  }),
);

export default router;
