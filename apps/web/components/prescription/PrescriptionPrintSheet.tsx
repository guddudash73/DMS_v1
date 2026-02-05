// apps/web/components/prescription/PrescriptionPrintSheet.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import type { RxLineType, Visit, ToothDetail } from '@dcm/types';
import { useGetVisitRxQuery } from '@/src/store/api';
import { formatClinicDateShort } from '@/src/lib/clinicTime';
import { ToothDetailsBlock } from './ToothDetailsBlock';

type PatientSex = 'M' | 'F' | 'O' | 'U';

type Props = {
  patientName?: string;
  patientPhone?: string;

  patientAge?: number | string;
  patientSex?: PatientSex;

  sdId?: string;
  opdNo?: string;

  doctorName?: string;
  doctorRegdLabel?: string;

  regdDate?: string;
  visitDateLabel?: string;

  lines: RxLineType[];

  currentVisitId?: string;
  chainVisitIds?: string[];
  visitMetaMap?: Map<string, Visit>;
  printWithHistory?: boolean;

  doctorNotes?: string;
  receptionNotes?: string;

  toothDetails?: ToothDetail[];
};

// const FREQ_LABEL: Record<RxLineType['frequency'], string> = {
//   QD: 'Once Daily',
//   BID: 'Twice Daily',
//   TID: 'Thrice Daily',
//   QID: 'Four Times Daily',
//   HS: 'At Bedtime',
//   PRN: 'As Needed',
// };

const TIMING_LABEL: Record<NonNullable<RxLineType['timing']>, string> = {
  BEFORE_MEAL: 'before food',
  AFTER_MEAL: 'after food',
  ANY: '',
};

// function buildLineText(l: RxLineType) {
//   const parts: string[] = [];
//   const med = [l.medicine, l.dose].filter(Boolean).join(' ').trim();
//   if (med) parts.push(med);

//   const freq = l.frequency ? `${l.frequency}(${FREQ_LABEL[l.frequency]})` : '';
//   const timing = l.timing ? TIMING_LABEL[l.timing] : '';
//   const freqTiming = [freq, timing].filter(Boolean).join(' ').trim();
//   if (freqTiming) parts.push(`- ${freqTiming}`);

//   if (typeof l.duration === 'number' && l.duration > 0) parts.push(`For ${l.duration} days.`);
//   if (l.notes?.trim()) parts.push(l.notes.trim());

//   return parts.join(' ');
// }

function formatAgeSex(age?: number | string, sex?: PatientSex) {
  const ageStr =
    typeof age === 'number'
      ? Number.isFinite(age) && age > 0
        ? String(age)
        : ''
      : (age ?? '').toString().trim();

  const sexStr = (sex ?? '').toString().trim().toUpperCase();

  if (!ageStr && !sexStr) return '—';
  if (ageStr && sexStr) return `${ageStr}/${sexStr}`;
  return ageStr || sexStr || '—';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getMetaValue(v: unknown, key: string): unknown {
  if (!isRecord(v)) return undefined;
  return v[key];
}

function getFirstMetaValue(v: unknown, keys: string[]): unknown {
  for (const k of keys) {
    const val = getMetaValue(v, k);
    if (val !== undefined) return val;
  }
  return undefined;
}

function getMetaString(v: unknown, key: string): string | undefined {
  const val = getMetaValue(v, key);
  if (val == null) return undefined;
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return undefined;
}

function getVisitOpdNo(v?: Visit): string | undefined {
  if (!v) return undefined;

  const raw = getFirstMetaValue(v, ['opdNo', 'opdNumber', 'opdId', 'opd', 'opd_no', 'opd_no_str']);
  if (raw == null) return undefined;

  const s = String(raw).trim();
  return s || undefined;
}

function VisitRxFetcher(props: {
  visitId: string;
  enabled: boolean;
  onData: (
    visitId: string,
    data: { lines: RxLineType[]; toothDetails: ToothDetail[]; doctorNotes: string },
  ) => void;
}) {
  const { visitId, enabled, onData } = props;
  const q = useGetVisitRxQuery({ visitId }, { skip: !enabled || !visitId });

  useEffect(() => {
    if (!enabled) return;
    if (!visitId) return;
    if (!q.data?.rx) return;

    onData(visitId, {
      lines: q.data.rx.lines ?? [],
      toothDetails: q.data.rx.toothDetails ?? [],
      doctorNotes: (q.data.rx.doctorNotes ?? '').toString(),
    });
  }, [enabled, visitId, q.data, onData]);

  return null;
}

type VisitRxData = {
  visitId: string;
  isCurrent: boolean;
  visit?: Visit;

  visitDate?: string;
  reason?: string;

  opdInline?: string;
  showOpdInline: boolean;

  lines: RxLineType[];
  toothDetails: ToothDetail[];
  doctorNotes: string;
};

type RowType =
  | 'VISIT_HEADER'
  | 'TOOTH_BLOCK'
  | 'MEDS_LABEL'
  | 'MED_LINE'
  | 'DOCTOR_NOTES'
  | 'DIVIDER'
  | 'RECEPTION_NOTES';

type RowModel = {
  key: string;
  rowType: RowType;

  visitId?: string;
  medIndex?: number;

  receptionText?: string;
};

function RowRenderer(props: {
  row: RowModel;
  byVisit: Map<string, VisitRxData>;
  medsOnPage: Map<string, number[]>;
  medOffsetByVisit: Map<string, number>;
}) {
  const { row, byVisit, medsOnPage, medOffsetByVisit } = props;

  if (row.rowType === 'RECEPTION_NOTES') {
    const t = (row.receptionText ?? '').trim();
    if (!t) return null;
    return (
      <div className="px-10 pb-2">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="text-[11px] font-semibold text-black">Reception Notes</div>
          <div className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-black">{t}</div>
        </div>
      </div>
    );
  }

  const vid = row.visitId ?? '';
  const v = byVisit.get(vid);
  if (!v) return null;

  const hasTooth = (v.toothDetails?.length ?? 0) > 0;
  const hasMeds = (v.lines?.length ?? 0) > 0;
  const hasNotes = !!v.doctorNotes?.trim();

  if (row.rowType === 'VISIT_HEADER') {
    return (
      <div className="px-8">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-[12px] font-bold text-black">
            {v.visitDate ? formatClinicDateShort(v.visitDate) : '—'}
          </div>

          <div className="ml-4 flex min-w-0 flex-1 items-baseline justify-end gap-3">
            <div className="min-w-0 flex-1 truncate text-right text-[11px] font-medium text-black">
              {v.reason?.trim() ? v.reason.trim() : ''}
            </div>

            {v.showOpdInline && v.opdInline ? (
              <div className="shrink-0 text-right text-[11px] font-semibold text-black">
                {v.opdInline}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (row.rowType === 'TOOTH_BLOCK') {
    if (!hasTooth) return null;
    return (
      <div className="px-8">
        <div className="mb-2">
          <ToothDetailsBlock toothDetails={v.toothDetails} />
        </div>
      </div>
    );
  }

  if (row.rowType === 'MEDS_LABEL') {
    if (!hasMeds) return null;
    return (
      <div className="px-8">
        <div className="mb-1 text-[11px] font-semibold text-black">Medicines:</div>
      </div>
    );
  }

  if (row.rowType === 'MED_LINE') {
    if (!hasMeds) return null;
    const idx = row.medIndex ?? -1;
    if (idx < 0) return null;

    const allowed = medsOnPage.get(vid) ?? [];
    if (!allowed.includes(idx)) return null;

    const line = v.lines[idx];
    if (!line) return null;

    const offset = medOffsetByVisit.get(vid) ?? 0;
    const number = offset + (allowed.indexOf(idx) + 1);

    return (
      <div className="px-8">
        <div className="mb-1 flex gap-2 text-[13px] leading-5 text-black">
          <div className="w-5 shrink-0 text-right font-medium">{number}.</div>
          {/* <div className="font-medium">{buildLineText(line)}</div> */}
        </div>
      </div>
    );
  }

  if (row.rowType === 'DOCTOR_NOTES') {
    if (!hasNotes) return null;
    return (
      <div className="px-8">
        <div className="mt-2 text-[11px] leading-4 text-black">
          <span className="font-semibold">Notes: </span>
          <span className="whitespace-pre-wrap">{v.doctorNotes.trim()}</span>
        </div>
      </div>
    );
  }

  if (row.rowType === 'DIVIDER') {
    return (
      <div className="px-8">
        <div className="mt-3 h-px w-full bg-gray-300" />
      </div>
    );
  }

  return null;
}

function PrintRows(props: {
  pageRows: RowModel[];
  byVisit: Map<string, VisitRxData>;
  pages: RowModel[][];
  pageIndex: number;
}) {
  const { pageRows, byVisit, pages, pageIndex } = props;

  const medsOnPage = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const r of pageRows) {
      if (!r.visitId) continue;
      if (r.rowType !== 'MED_LINE') continue;
      const idx = r.medIndex;
      if (typeof idx !== 'number' || idx < 0) continue;
      m.set(r.visitId, [...(m.get(r.visitId) ?? []), idx]);
    }
    return m;
  }, [pageRows]);

  const medOffsetByVisit = useMemo(() => {
    const m = new Map<string, number>();
    if (!pages.length || pageIndex <= 0) return m;

    for (let p = 0; p < pageIndex; p++) {
      const pr = pages[p] ?? [];
      for (const r of pr) {
        if (!r.visitId) continue;
        if (r.rowType !== 'MED_LINE') continue;
        m.set(r.visitId, (m.get(r.visitId) ?? 0) + 1);
      }
    }
    return m;
  }, [pages, pageIndex]);

  return (
    <div>
      {pageRows.map((r) => {
        const isCurrent = r.visitId ? byVisit.get(r.visitId)?.isCurrent : false;

        // IMPORTANT: wrapper ALWAYS renders so measurement count stays stable
        return (
          <div
            key={r.key}
            data-measure-row="1"
            data-is-current={isCurrent ? '1' : '0'}
            style={{ paddingTop: 4 }}
          >
            <RowRenderer
              row={r}
              byVisit={byVisit}
              medsOnPage={medsOnPage}
              medOffsetByVisit={medOffsetByVisit}
            />
          </div>
        );
      })}
    </div>
  );
}

export function PrescriptionPrintSheet(props: Props) {
  const {
    patientName,
    patientPhone,
    patientAge,
    patientSex,
    sdId,
    opdNo,
    regdDate,
    lines,
    doctorNotes,
    receptionNotes,

    currentVisitId: currentVisitIdProp,
    chainVisitIds: chainVisitIdsProp,
    visitMetaMap: visitMetaMapProp,

    toothDetails: toothDetailsProp,
  } = props;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [currentOnlyMode, setCurrentOnlyMode] = useState(false);
  useEffect(() => {
    if (!mounted) return;
    setCurrentOnlyMode(document.body.classList.contains('print-rx-current-only'));
  }, [mounted]);

  const hasReceptionNotes = !!receptionNotes?.trim();
  const ageSex = formatAgeSex(patientAge, patientSex);

  const headerRegdDate = useMemo(() => {
    const s = (regdDate ?? '').toString().trim();
    return s || '—';
  }, [regdDate]);

  const currentVisitId = useMemo(() => currentVisitIdProp ?? 'CURRENT', [currentVisitIdProp]);

  const chainVisitIds = useMemo(() => {
    if (chainVisitIdsProp && chainVisitIdsProp.length) return chainVisitIdsProp;
    return [currentVisitId];
  }, [chainVisitIdsProp, currentVisitId]);

  const visitMetaMap = useMemo(
    () => visitMetaMapProp ?? new Map<string, Visit>(),
    [visitMetaMapProp],
  );

  const historyEnabled =
    !!currentVisitIdProp &&
    !!chainVisitIdsProp &&
    chainVisitIdsProp.length > 0 &&
    !!visitMetaMapProp;

  const anchorVisitId = useMemo(() => {
    if (!historyEnabled) return undefined;
    return chainVisitIds[0];
  }, [historyEnabled, chainVisitIds]);

  const headerOpdNo = useMemo(() => {
    if (historyEnabled && anchorVisitId) {
      const anchorVisit = visitMetaMap.get(anchorVisitId);
      const anchorOpd = getVisitOpdNo(anchorVisit);
      if (anchorOpd) return anchorOpd;
    }
    return opdNo ?? '—';
  }, [historyEnabled, anchorVisitId, visitMetaMap, opdNo]);

  const currentToothDetails = useMemo(() => toothDetailsProp ?? [], [toothDetailsProp]);

  // constants
  const CONTACT_NUMBER = '9938942846';
  const EMERGENCY_NUMBER = '9437189900';
  const ADDRESS_LEFT = ['A-33', 'STALWART COMPLEX', 'UNIT - IV', 'BHUBANESWAR'];
  const CLINIC_HOURS_TIMING = ['10 : 00 AM - 1 : 30 PM', '06 : 00 PM - 8 : 00 PM'];

  // guards (Chrome print rounding)
  const GUARD_FIRST_PX = 220;
  const GUARD_FULL_PX = 120;

  // rx data map for previous visits
  const [rxMap, setRxMap] = useState<
    Record<string, { lines: RxLineType[]; toothDetails: ToothDetail[]; doctorNotes: string }>
  >({});

  const setVisitRx = useMemo(() => {
    return (
      visitId: string,
      data: { lines: RxLineType[]; toothDetails: ToothDetail[]; doctorNotes: string },
    ) => {
      setRxMap((prev) => ({ ...prev, [visitId]: data }));
    };
  }, []);

  const Fetchers = historyEnabled ? (
    <>
      {chainVisitIds.map((id) => {
        const isCur = id === currentVisitId;
        const shouldFetch = !isCur && id !== 'CURRENT' && !!id;
        return (
          <VisitRxFetcher
            key={`fetch:${id}`}
            visitId={id}
            enabled={shouldFetch}
            onData={setVisitRx}
          />
        );
      })}
    </>
  ) : null;

  const visitsData: VisitRxData[] = useMemo(() => {
    const out: VisitRxData[] = [];

    for (const id of chainVisitIds) {
      const isCur = id === currentVisitId;
      const visit = visitMetaMap.get(id);

      const isAnchor = anchorVisitId != null && id === anchorVisitId;
      const opdInline = !isAnchor ? getVisitOpdNo(visit) : undefined;

      const rx = !isCur ? rxMap[id] : undefined;

      out.push({
        visitId: id,
        isCurrent: isCur,
        visit,
        visitDate: getMetaString(visit, 'visitDate'),
        reason: getMetaString(visit, 'reason'),
        opdInline,
        showOpdInline: !isAnchor,
        lines: isCur ? lines : (rx?.lines ?? []),
        toothDetails: isCur ? currentToothDetails : (rx?.toothDetails ?? []),
        doctorNotes: isCur ? (doctorNotes ?? '') : (rx?.doctorNotes ?? ''),
      });
    }

    return out;
  }, [
    chainVisitIds,
    currentVisitId,
    visitMetaMap,
    anchorVisitId,
    rxMap,
    lines,
    currentToothDetails,
    doctorNotes,
  ]);

  const byVisit = useMemo(() => {
    const m = new Map<string, VisitRxData>();
    for (const v of visitsData) m.set(v.visitId, v);
    return m;
  }, [visitsData]);

  const rows: RowModel[] = useMemo(() => {
    if (!historyEnabled) return [];
    const out: RowModel[] = [];

    for (const v of visitsData) {
      const hasTooth = (v.toothDetails?.length ?? 0) > 0;
      const hasMeds = (v.lines?.length ?? 0) > 0;
      const hasNotes = !!v.doctorNotes?.trim();

      if (!hasTooth && !hasMeds && !hasNotes && !v.visitDate && !v.reason) continue;

      out.push({ key: `${v.visitId}:H`, rowType: 'VISIT_HEADER', visitId: v.visitId });

      if (hasTooth) out.push({ key: `${v.visitId}:T`, rowType: 'TOOTH_BLOCK', visitId: v.visitId });

      if (hasMeds) {
        out.push({ key: `${v.visitId}:ML`, rowType: 'MEDS_LABEL', visitId: v.visitId });
        for (let i = 0; i < v.lines.length; i++) {
          out.push({
            key: `${v.visitId}:M:${i}`,
            rowType: 'MED_LINE',
            visitId: v.visitId,
            medIndex: i,
          });
        }
      }

      if (hasNotes)
        out.push({ key: `${v.visitId}:N`, rowType: 'DOCTOR_NOTES', visitId: v.visitId });

      out.push({ key: `${v.visitId}:D`, rowType: 'DIVIDER', visitId: v.visitId });
    }

    if (hasReceptionNotes) {
      out.push({
        key: `R:NOTES`,
        rowType: 'RECEPTION_NOTES',
        receptionText: receptionNotes!.trim(),
      });
    }

    return out;
  }, [historyEnabled, visitsData, hasReceptionNotes, receptionNotes]);

  // measurement refs
  const firstCapRef = useRef<HTMLDivElement | null>(null);
  const fullCapRef = useRef<HTMLDivElement | null>(null);
  const measureRootRef = useRef<HTMLDivElement | null>(null);

  const [capFirst, setCapFirst] = useState<number>(520);
  const [capFull, setCapFull] = useState<number>(860);
  const [rowHeights, setRowHeights] = useState<number[]>([]);
  const [pages, setPages] = useState<RowModel[][]>([]);

  const measureFnRef = useRef<(() => void) | null>(null);
  const forceMeasure = () => measureFnRef.current?.();

  const Header = (
    <div className="px-5 pt-8 pb-4 text-black">
      <div className="flex items-stretch justify-between gap-6 px-2">
        <div className="relative h-28 w-28 shrink-0">
          <Image
            src="/rx-logo-r.png"
            alt="Rx Logo"
            fill
            className="object-contain"
            priority
            unoptimized
            onLoadingComplete={forceMeasure}
          />
        </div>

        <div className="flex w-full items-center justify-center gap-16 text-center">
          <div className="flex flex-col items-center">
            <div className="text-[15px] font-bold tracking-[0.28em] uppercase text-emerald-700/70">
              CONTACT
            </div>
            <div className="mt-1 text-[15px] font-medium tracking-widest">{CONTACT_NUMBER}</div>
          </div>

          <div className="flex flex-col items-center">
            <div className="text-[15px] font-bold tracking-wider uppercase text-emerald-700/70">
              EMERGENCY
            </div>
            <div className="mt-1 text-[15px] font-medium tracking-widest">{EMERGENCY_NUMBER}</div>
          </div>
        </div>

        <div className="relative h-24 w-48 shrink-0">
          <Image
            src="/dashboard-logo.png"
            alt="Sarangi Dentistry"
            fill
            className="object-contain"
            priority
            unoptimized
            onLoadingComplete={forceMeasure}
          />
        </div>
      </div>

      <div className="mt-3 h-0.5 w-full bg-emerald-700/70" />

      <div className="mt-6 flex items-start justify-between gap-6 px-4">
        <div className="min-w-0 flex flex-col">
          <div className="text-[0.85rem] font-bold">Dr. Soumendra Sarangi</div>
          <div className="mt-0.5 text-[0.72rem] font-medium">B.D.S. Regd. - 68</div>
        </div>

        <div className="min-w-0 flex flex-col items-end text-right">
          <div className="text-[0.85rem] font-bold">Dr. Vaishnovee Sarangi</div>
          <div className="mt-0.5 text-[0.72rem] font-medium">B.D.S. Redg. - 3057</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-12 px-2">
        <div className="space-y-2 text-[0.8rem]">
          <div className="flex gap-3">
            <div className="w-24 font-medium">Patient Name</div>
            <div>:</div>
            <div className="font-semibold">{patientName ?? '—'}</div>
          </div>

          <div className="flex gap-3">
            <div className="w-24 font-medium">Contact No.</div>
            <div>:</div>
            <div className="font-semibold">{patientPhone ?? '—'}</div>
          </div>

          <div className="flex gap-3">
            <div className="w-24 font-medium">Age / Sex</div>
            <div>:</div>
            <div className="font-semibold">{ageSex}</div>
          </div>
        </div>

        <div className="space-y-2 text-[0.8rem]">
          <div className="flex gap-3">
            <div className="w-24 font-medium">Regd. Date</div>
            <div>:</div>
            <div className="font-semibold">{headerRegdDate}</div>
          </div>

          <div className="flex gap-3">
            <div className="w-24 font-medium">SD-ID</div>
            <div>:</div>
            <div className="font-semibold">{sdId ?? '—'}</div>
          </div>

          <div className="flex gap-3">
            <div className="w-24 font-medium">OPD No.</div>
            <div>:</div>
            <div className="font-semibold">{headerOpdNo}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 h-px w-full bg-gray-900/30" />
    </div>
  );

  const Footer = (
    <div className="px-4 pb-6 text-black">
      <div className="h-0.5 w-full bg-emerald-700/70" />

      <div className="flex items-start justify-between gap-8 px-5">
        <div className="mt-2 text-[0.9rem]">
          {ADDRESS_LEFT.map((l) => (
            <div key={l} className="leading-5">
              {l}
            </div>
          ))}
        </div>

        <div className="mt-2">
          <div className="flex text-[15px] font-bold text-emerald-700/70">
            <div className="tracking-[0.35em]">CLINIC HOUR</div>
            <div>S</div>
          </div>

          {CLINIC_HOURS_TIMING.map((l) => (
            <div key={l} className="text-right text-[15px] leading-5 tracking-[0.05em]">
              {l}
            </div>
          ))}

          <div className="flex text-[15px] font-bold text-red-500">
            <div className="tracking-[0.24em]">SUNDAY CLOSE</div>
            <div>D</div>
          </div>
        </div>
      </div>
    </div>
  );

  // ✅ CRITICAL FIX:
  // The measurement template must have A4+grid sizing even OUTSIDE print,
  // otherwise capFirst becomes huge and pagination never splits.
  const measureTemplate = historyEnabled ? (
    <div aria-hidden="true">
      <div
        style={{
          position: 'fixed',
          left: '-10000px',
          top: 0,
          width: '210mm',
          height: '297mm',
          opacity: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          background: '#fff',
        }}
      >
        {/* Page 1 template (header + bounded content + footer) */}
        <div style={{ width: '210mm', height: '297mm', overflow: 'hidden', background: '#fff' }}>
          <div
            style={{
              width: '210mm',
              height: '297mm',
              display: 'grid',
              gridTemplateRows: 'auto 1fr auto',
            }}
          >
            <div style={{ overflow: 'hidden' }}>{Header}</div>

            <div
              ref={firstCapRef}
              style={{
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <div ref={measureRootRef}>
                <PrintRows pageRows={rows} byVisit={byVisit} pages={[rows]} pageIndex={0} />
              </div>
            </div>

            <div style={{ overflow: 'hidden' }}>{Footer}</div>
          </div>
        </div>

        {/* Content-only page template (bounded) */}
        <div style={{ width: '210mm', height: '297mm', overflow: 'hidden', background: '#fff' }}>
          <div
            style={{
              width: '210mm',
              height: '297mm',
              boxSizing: 'border-box',
              padding: '8mm 6mm 6mm',
              overflow: 'hidden',
            }}
          >
            <div ref={fullCapRef} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
      </div>
    </div>
  ) : null;

  useEffect(() => {
    if (!historyEnabled) return;

    const measure = () => {
      if (firstCapRef.current) {
        const h = Math.floor(firstCapRef.current.getBoundingClientRect().height);
        if (Number.isFinite(h) && h > 140) setCapFirst(h);
      }
      if (fullCapRef.current) {
        const h = Math.floor(fullCapRef.current.getBoundingClientRect().height);
        if (Number.isFinite(h) && h > 200) setCapFull(h);
      }

      const root = measureRootRef.current;
      if (!root) return;

      const kids = Array.from(root.querySelectorAll('[data-measure-row="1"]')) as HTMLElement[];
      const heights = kids.map((k) => {
        const rect = k.getBoundingClientRect();
        const cs = window.getComputedStyle(k);
        const mt = Number.parseFloat(cs.marginTop || '0') || 0;
        const mb = Number.parseFloat(cs.marginBottom || '0') || 0;
        return Math.ceil(rect.height + mt + mb);
      });

      setRowHeights(heights);
    };

    measureFnRef.current = measure;

    measure();
    const raf1 = requestAnimationFrame(measure);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(measure));
    const t = window.setTimeout(measure, 250);

    const ro = new ResizeObserver(() => measure());
    if (firstCapRef.current) ro.observe(firstCapRef.current);
    if (fullCapRef.current) ro.observe(fullCapRef.current);
    if (measureRootRef.current) ro.observe(measureRootRef.current);

    if ((document as any).fonts?.ready) {
      (document as any).fonts.ready.then(() => requestAnimationFrame(measure));
    }

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t);
      ro.disconnect();
      measureFnRef.current = null;
    };
  }, [historyEnabled, rows.length]);

  useEffect(() => {
    if (!historyEnabled) return;

    if (!rows.length) {
      setPages([]);
      return;
    }

    if (!rowHeights.length || rowHeights.length !== rows.length) {
      setPages([rows]);
      return;
    }

    const firstCap = Math.max(160, capFirst - GUARD_FIRST_PX);
    const fullCap = Math.max(240, capFull - GUARD_FULL_PX);

    const headerRowForVisit = (visitId: string): RowModel | null => {
      const key = `${visitId}:H`;
      const found = rows.find((r) => r.key === key);
      return found ?? null;
    };

    const idxOfRowKey = (key: string) => rows.findIndex((r) => r.key === key);

    const out: RowModel[][] = [];
    let cur: RowModel[] = [];
    let used = 0;
    let cap = firstCap;

    const pushPage = () => {
      if (!cur.length) return;
      out.push(cur);
      cur = [];
      used = 0;
      cap = fullCap;
    };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const h = rowHeights[i] ?? 0;

      if (cur.length > 0 && used + h > cap) {
        const next = r;
        pushPage();

        // repeat visit header on continuation pages
        if (next.visitId && next.rowType !== 'VISIT_HEADER' && next.rowType !== 'RECEPTION_NOTES') {
          const hdr = headerRowForVisit(next.visitId);
          if (hdr) {
            const hdrIdx = idxOfRowKey(hdr.key);
            const hdrH = hdrIdx >= 0 ? (rowHeights[hdrIdx] ?? 0) : 0;

            cur.push(hdr);
            used += hdrH;
          }
        }
      }

      cur.push(r);
      used += h;
    }

    if (cur.length) out.push(cur);
    setPages(out.length ? out : [rows]);
  }, [historyEnabled, rows, rowHeights, capFirst, capFull]);

  const pagesToRender = useMemo(() => {
    if (!historyEnabled) return null;
    const all = pages.length ? pages : [rows];

    if (!currentOnlyMode) return all;

    const pageIdx = all.findIndex((p) => p.some((r) => r.visitId === currentVisitId));
    if (pageIdx < 0) return [all[0]];
    return [all[pageIdx]];
  }, [historyEnabled, pages, rows, currentOnlyMode, currentVisitId]);

  if (!mounted) return null;

  const renderFirstPage = (pageRows: RowModel[], pageIndex: number) => (
    <div key={pageIndex} className="rx-a4 text-black">
      <div className="rx-grid-page">
        <div className="rx-print-header">{Header}</div>
        <div className="rx-print-content">
          <PrintRows
            pageRows={pageRows}
            byVisit={byVisit}
            pages={pagesToRender ?? []}
            pageIndex={pageIndex}
          />
        </div>
        <div className="rx-print-footer">{Footer}</div>
      </div>
    </div>
  );

  const renderContentOnlyPage = (pageRows: RowModel[], pageIndex: number) => (
    <div key={pageIndex} className="rx-a4 text-black">
      <div className="rx-content-only">
        <PrintRows
          pageRows={pageRows}
          byVisit={byVisit}
          pages={pagesToRender ?? []}
          pageIndex={pageIndex}
        />
      </div>
    </div>
  );

  const renderHistoryPages = () => {
    const all = pagesToRender ?? [rows];
    return all.map((pageRows, i) => {
      const isFirst = !currentOnlyMode && i === 0;
      return isFirst ? renderFirstPage(pageRows, i) : renderContentOnlyPage(pageRows, i);
    });
  };

  const renderSingleVisitOldFlow = () => (
    <div className="rx-a4 text-black">
      <div className="rx-content-only">
        {currentToothDetails.length > 0 ? (
          <div className="mb-3">
            <ToothDetailsBlock toothDetails={currentToothDetails} />
          </div>
        ) : null}

        {lines.length ? (
          <ol className="space-y-1 text-[13px] leading-5 text-gray-900">
            {lines.map((l, idx) => (
              <li key={idx} className="flex gap-2">
                <div className="w-5 shrink-0 text-right font-medium">{idx + 1}.</div>
                {/* <div className="font-medium">{buildLineText(l)}</div> */}
              </li>
            ))}
          </ol>
        ) : (
          <div className="text-[12px] text-gray-500">No medicines recorded.</div>
        )}
      </div>
    </div>
  );

  return createPortal(
    <div className="rx-print-root">
      {Fetchers}
      {measureTemplate}

      <style>{`
        .rx-print-root { display: none; }

        @media print {
          body.print-rx > *:not(.rx-print-root) { display: none !important; }
          body.print-rx .rx-print-root { display: block !important; }

          @page { size: A4; margin: 0; }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .rx-a4 {
            width: 210mm;
            height: 297mm;
            margin: 0 auto;
            padding: 0;
            box-sizing: border-box;
            background: #fff;
            page-break-after: always;
            break-after: page;
            overflow: hidden;
          }
          .rx-a4:last-child { page-break-after: auto; break-after: auto; }

          .rx-grid-page {
            height: 297mm;
            width: 210mm;
            display: grid;
            grid-template-rows: auto 1fr auto;
          }

          .rx-print-content {
            min-height: 0;
            overflow: hidden;
          }

          .rx-content-only {
            height: 297mm;
            width: 210mm;
            box-sizing: border-box;
            padding: 8mm 6mm 6mm;
            overflow: hidden;
          }

          /* current-only mode */
          body.print-rx.print-rx-current-only [data-is-current="0"] { display: none !important; }
        }
      `}</style>

      <div>{!historyEnabled ? renderSingleVisitOldFlow() : renderHistoryPages()}</div>
    </div>,
    document.body,
  );
}
