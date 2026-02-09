// apps/web/components/prescription/PrescriptionPreview.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import type { RxLineType, Visit, ToothDetail } from '@dcm/types';
import { useGetVisitRxQuery } from '@/src/store/api';
import { ToothDetailsBlock } from './ToothDetailsBlock';

type PatientSex = 'M' | 'F' | 'O' | 'U';
type PageKind = 'ODD' | 'EVEN';

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

  doctorNotes?: string;
  receptionNotes?: string;

  currentVisitId?: string;
  chainVisitIds?: string[];
  visitMetaMap?: Map<string, Visit>;

  toothDetails?: ToothDetail[];

  currentOnly?: boolean;

  showPrintHeader?: boolean;

  onActivePageKindChange?: (kind: PageKind) => void;
};

// Keep these tolerant (RxLine fields are optional)
const FREQ_LABEL: Record<string, string> = {
  QD: 'once daily',
  BID: 'twice daily',
  TID: 'thrice daily',
  QID: 'four times daily',
  HS: 'at bedtime',
  PRN: 'as needed',
};

const TIMING_LABEL: Record<string, string> = {
  BEFORE_MEAL: 'before food',
  AFTER_MEAL: 'after food',
  ANY: 'any time',
};

function safeTrim(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * ✅ New date format for visit header: dd/MM/yyyy
 * Accepts ISO-like strings, timestamps, or date-ish strings from Visit meta.
 */
function formatClinicDateDDMMYYYY(input?: string): string {
  const s = (input ?? '').toString().trim();
  if (!s) return '—';

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());

  return `${dd}/${mm}/${yyyy}`;
}

function getMedicineType(l: RxLineType): string {
  const t = safeTrim((l as any).medicineType);
  return t || '—';
}

/**
 * ✅ Title now includes:
 * - medicine + dose (ONLY HERE)
 * - quantity moved next to medicine name (same font size)
 * - NO "Qty:" label
 *
 * Example: "Omini 400mg (10 Tabs)"
 */
function buildMedicineTitle(l: RxLineType): string {
  const med = safeTrim((l as any).medicine);
  const dose = safeTrim((l as any).dose);
  const quantity = safeTrim((l as any).quantity);

  const base = [med, dose].filter(Boolean).join(' ').trim();
  if (!base) return '—';

  return quantity ? `${base} (${quantity})` : base;
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

type VisitRxData = {
  visitId: string;
  visit?: Visit;
  isCurrent: boolean;
  lines: RxLineType[];
  toothDetails: ToothDetail[];
  doctorNotes: string;
  visitDate?: string;
  opdInline?: string;
};

type RowType = 'VISIT_HEADER' | 'TOOTH_BLOCK' | 'MED_LINE' | 'DOCTOR_NOTES' | 'DIVIDER';

type RowModel = {
  key: string;
  visitId: string;
  rowType: RowType;
  medIndex?: number;
  showOpdInline?: boolean;
};

type PageModel = {
  kind: PageKind;
  rows: RowModel[];
};

function PaginationBar(props: { page: number; total: number; onChange: (p: number) => void }) {
  const { page, total, onChange } = props;
  if (total <= 1) return null;

  const mkBtn = (active: boolean, disabled?: boolean) =>
    [
      'h-8 min-w-8 rounded-lg border px-2 text-xs font-semibold transition',
      disabled ? 'opacity-50 cursor-not-allowed' : '',
      active ? 'bg-black text-white border-black' : 'bg-white text-black hover:bg-gray-50',
    ].join(' ');

  return (
    <div
      className="rx-preview-pagination mt-3 flex items-center justify-center gap-2"
      data-pagination="1"
    >
      <button
        type="button"
        className={mkBtn(false, page <= 1)}
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        Prev
      </button>

      {Array.from({ length: total }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          type="button"
          className={mkBtn(p === page)}
          onClick={() => onChange(p)}
          title={`Page ${p}`}
        >
          {p}
        </button>
      ))}

      <button
        type="button"
        className={mkBtn(false, page >= total)}
        onClick={() => onChange(Math.min(total, page + 1))}
        disabled={page >= total}
      >
        Next
      </button>
    </div>
  );
}

/**
 * ✅ Instruction rendering (ReactNode):
 * - dose removed (so it doesn't duplicate)
 * - quantity removed (already in title)
 * - if timing label is "before food" => underline ONLY that text
 */
function buildInstructionNode(l: RxLineType): React.ReactNode | null {
  const amountPerDose = safeTrim((l as any).amountPerDose);
  const freq = safeTrim((l as any).frequency);
  const timingRaw = safeTrim((l as any).timing);
  const notes = safeTrim((l as any).notes);

  const parts: React.ReactNode[] = [];

  if (amountPerDose) parts.push(amountPerDose);

  if (freq) {
    const freqText = FREQ_LABEL[freq] ?? freq.toLowerCase();
    if (freqText) parts.push(freqText);
  }

  if (timingRaw) {
    const timingText = TIMING_LABEL[timingRaw] ?? timingRaw.toLowerCase();
    if (timingText) {
      if (timingText === 'before food') {
        parts.push(
          <span key="timing-before-food" className="underline underline-offset-2">
            before food
          </span>,
        );
      } else {
        parts.push(timingText);
      }
    }
  }

  const hasBase = parts.length > 0;
  const hasNotes = !!notes;

  if (!hasBase && !hasNotes) return null;

  // join base parts with spaces without losing ReactNode formatting
  const baseNode = hasBase ? (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 ? ' ' : null}
          {p}
        </React.Fragment>
      ))}
    </>
  ) : null;

  if (baseNode && hasNotes)
    return (
      <>
        {baseNode}. {notes}
      </>
    );
  if (baseNode) return <>{baseNode}.</>;
  return <>{notes}</>;
}

/**
 * ✅ Medicines layout:
 * - TYPE in its own column
 * - NAME + INSTRUCTION in separate column
 * - RIGHT block (name + instruction) is italic (per your requirement)
 */
function MedicineLineBlock(props: {
  line: RxLineType;
  number: number;
  wrapperClassName: string;
  typeColClassName: string;
  numberColClassName: string;
  instrWrapperClassName: string;
  instrNumberSpacerClassName: string;
}) {
  const {
    line,
    number,
    wrapperClassName,
    typeColClassName,
    numberColClassName,
    instrWrapperClassName,
    instrNumberSpacerClassName,
  } = props;

  const typeText = getMedicineType(line);
  const title = buildMedicineTitle(line);
  const instrNode = buildInstructionNode(line);

  return (
    <div className={wrapperClassName}>
      <div className="grid grid-cols-[auto_1fr] gap-4">
        <div className={typeColClassName}>{typeText}</div>

        {/* ✅ entire RIGHT block italic */}
        <div className="min-w-0 italic">
          {/* medicine title */}
          <div className="flex min-w-0 items-start text-[18px] leading-5 text-black">
            <div className={numberColClassName}>{number}.</div>
            <div className="min-w-0 ml-1 whitespace-normal font-bold">{title}</div>
          </div>

          {instrNode ? (
            <div className={[instrWrapperClassName, 'min-w-0'].join(' ')}>
              <div className={instrNumberSpacerClassName} />
              <div className="min-w-0 ml-1 whitespace-normal">{instrNode}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
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

    const next = {
      lines: q.data.rx.lines ?? [],
      toothDetails: q.data.rx.toothDetails ?? [],
      doctorNotes: (q.data.rx.doctorNotes ?? '').toString(),
    };
    onData(visitId, next);
  }, [enabled, visitId, q.data, onData]);

  return null;
}

function VisitRowRenderer(props: {
  v: VisitRxData;
  row: RowModel;
  medIndexesOnPage: number[];
  medNumberOffset: number;
  hideVisitDate?: boolean;
}) {
  const { v, row, medIndexesOnPage, medNumberOffset, hideVisitDate } = props;

  const hasToothDetails = (v.toothDetails?.length ?? 0) > 0;
  const hasMedicines = (v.lines?.length ?? 0) > 0;
  const hasDoctorNotes = !!v.doctorNotes?.trim();

  if (row.rowType === 'VISIT_HEADER') {
    return (
      <div data-rx-row="1" data-row-key={row.key} className="mb-1">
        <div className="flex items-baseline justify-between pb-2">
          <div className="text-[13px] font-bold text-black tracking-wide">
            {hideVisitDate ? '' : v.visitDate ? formatClinicDateDDMMYYYY(v.visitDate) : '—'}
          </div>

          <div className="ml-4 flex min-w-0 flex-1 items-baseline justify-end gap-3">
            {row.showOpdInline && v.opdInline ? (
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
    if (!hasToothDetails) return null;
    return (
      <div data-rx-row="1" data-row-key={row.key} className="mb-2">
        <div className="min-w-0 overflow-visible whitespace-normal">
          <ToothDetailsBlock toothDetails={v.toothDetails} />
        </div>
      </div>
    );
  }

  if (row.rowType === 'MED_LINE') {
    if (!hasMedicines) return null;
    const idx = row.medIndex ?? -1;
    if (idx < 0) return null;
    if (!medIndexesOnPage.includes(idx)) return null;

    const line = v.lines[idx];
    if (!line) return null;

    const number = medNumberOffset + (medIndexesOnPage.indexOf(idx) + 1);

    return (
      <div data-rx-row="1" data-row-key={row.key}>
        <MedicineLineBlock
          line={line}
          number={number}
          wrapperClassName="mb-6 ml-4"
          // medicine type
          typeColClassName="w-[58px] shrink-0 whitespace-normal text-[16px] font-medium text-right"
          numberColClassName="w-5 shrink-0 text-right font-medium"
          //description
          instrWrapperClassName="mt-1 flex items-start text-[16px] leading-4 text-black"
          instrNumberSpacerClassName="w-8 shrink-0"
        />
      </div>
    );
  }

  if (row.rowType === 'DOCTOR_NOTES') {
    if (!hasDoctorNotes) return null;
    return (
      <div data-rx-row="1" data-row-key={row.key} className="mt-2">
        {/* ✅ Printed doctor notes: bigger text */}
        <div className="text-[16px] leading-5 text-black">
          <span className="font-semibold">Notes: </span>
          <span className="whitespace-pre-line">{v.doctorNotes.trim()}</span>
        </div>
      </div>
    );
  }

  if (row.rowType === 'DIVIDER') {
    return (
      <div data-rx-row="1" data-row-key={row.key} className="mt-2">
        <div className="h-px w-full bg-gray-500" />
      </div>
    );
  }

  return null;
}

function ReceptionNotesRow(props: { text: string }) {
  const t = props.text.trim();
  if (!t) return null;
  return (
    <div data-rx-row="1" data-row-key="RECEPTION_NOTES" className="mt-2">
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
        <div className="text-[10px] font-semibold text-black">Reception Notes</div>
        <div className="mt-1 whitespace-pre-line text-[10px] leading-4 text-black">{t}</div>
      </div>
    </div>
  );
}

export function PrescriptionPreview({
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
  currentOnly = false,
  showPrintHeader = true,
  onActivePageKindChange,
}: Props) {
  const hasNotes = !!receptionNotes?.trim();
  const ageSex = formatAgeSex(patientAge, patientSex);

  const headerRegdDate = useMemo(() => {
    const s = (regdDate ?? '').toString().trim();
    return s || '—';
  }, [regdDate]);

  const currentVisitId = useMemo(() => currentVisitIdProp ?? 'CURRENT', [currentVisitIdProp]);

  const chainVisitIds = useMemo(() => {
    const ids = (
      chainVisitIdsProp && chainVisitIdsProp.length ? [...chainVisitIdsProp] : [currentVisitId]
    ).filter(Boolean);

    if (currentVisitId && !ids.includes(currentVisitId)) ids.push(currentVisitId);

    const seen = new Set<string>();
    return ids.filter((x) => {
      if (seen.has(x)) return false;
      seen.add(x);
      return true;
    });
  }, [chainVisitIdsProp, currentVisitId]);

  const chainKey = useMemo(() => JSON.stringify(chainVisitIds), [chainVisitIds]);

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

  // ---- Paper constants ----
  const CONTACT_NUMBER = '9938942846';
  const EMERGENCY_NUMBER = '9437189900';

  const ADDRESS_LEFT = ['A-33', 'STALWART COMPLEX', 'UNIT - IV', 'BHUBANESWAR'];
  const CLINIC_HOURS_TIMING = ['10 : 00 AM - 1 : 30 PM', '06 : 00 PM - 8 : 00 PM'];

  // A4 preview canvas
  const A4_W_PX = Math.round((210 / 25.4) * 96); // 794
  const A4_H_PX = Math.round((297 / 25.4) * 96); // 1123

  const BASE_W = A4_W_PX;
  const BASE_H = A4_H_PX;

  // spacing
  const CONTENT_PT_ODD = 6;
  const CONTENT_PB_ODD = 70;

  const CONTENT_PT_EVEN = 28;
  const CONTENT_PB_EVEN = 70;

  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const patientInfoRef = useRef<HTMLDivElement | null>(null);

  const [headerH, setHeaderH] = useState<number>(210);
  const [footerH, setFooterH] = useState<number>(125);
  const [patientInfoH, setPatientInfoH] = useState<number>(110);

  const readUnscaledHeight = (el: HTMLElement) => {
    const h = el.offsetHeight;
    return Number.isFinite(h) ? h : 0;
  };

  useEffect(() => {
    const hEl = headerRef.current;
    const fEl = footerRef.current;
    const pEl = patientInfoRef.current;
    if (!hEl || !fEl) return;

    const measure = () => {
      const h = readUnscaledHeight(hEl);
      const f = readUnscaledHeight(fEl);
      const p = pEl ? readUnscaledHeight(pEl) : 0;

      if (h > 0) setHeaderH(h);
      if (f > 0) setFooterH(f);
      if (p > 0) setPatientInfoH(p);
    };

    measure();
    requestAnimationFrame(measure);
    requestAnimationFrame(() => requestAnimationFrame(measure));

    const fontsReady = (document as any).fonts?.ready;
    if (fontsReady?.then) {
      fontsReady.then(() => requestAnimationFrame(measure));
    }

    let rafId = 0;
    const schedule = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => measure());
    };

    const ro = new ResizeObserver(() => schedule());
    ro.observe(hEl);
    ro.observe(fEl);
    if (pEl) ro.observe(pEl);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    let rafId = 0;

    const update = (width: number) => {
      const raw = Math.min(1, width / BASE_W);
      const next = Number.isFinite(raw) && raw > 0 ? raw : 1;
      const rounded = Math.round(next * 1000) / 1000;

      setScale((prev) => {
        if (Math.abs(prev - rounded) < 0.002) return prev;
        return rounded;
      });
    };

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? BASE_W;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => update(w));
    });

    ro.observe(el);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [BASE_W]);

  const currentToothDetails = useMemo(() => toothDetailsProp ?? [], [toothDetailsProp]);

  const [rxMap, setRxMap] = useState<
    Record<string, { lines: RxLineType[]; toothDetails: ToothDetail[]; doctorNotes: string }>
  >({});

  const setVisitRx = useMemo(() => {
    return (
      visitId: string,
      data: { lines: RxLineType[]; toothDetails: ToothDetail[]; doctorNotes: string },
    ) => {
      setRxMap((prev) => {
        const cur = prev[visitId];
        if (
          cur &&
          cur.lines.length === data.lines.length &&
          cur.toothDetails.length === data.toothDetails.length &&
          cur.doctorNotes === data.doctorNotes
        ) {
          return prev;
        }
        return { ...prev, [visitId]: data };
      });
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

      const visitDate = getMetaString(visit, 'visitDate');

      const rx = !isCur ? rxMap[id] : undefined;

      out.push({
        visitId: id,
        visit,
        isCurrent: isCur,
        lines: isCur ? lines : (rx?.lines ?? []),
        toothDetails: isCur ? currentToothDetails : (rx?.toothDetails ?? []),
        doctorNotes: isCur ? (doctorNotes ?? '') : (rx?.doctorNotes ?? ''),
        visitDate,
        opdInline,
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

  const vById = useMemo(() => {
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
      const hasDocNotes = !!v.doctorNotes?.trim();

      if (!hasTooth && !hasMeds && !hasDocNotes && !v.visitDate) continue;

      out.push({
        key: `${v.visitId}:H`,
        visitId: v.visitId,
        rowType: 'VISIT_HEADER',
        showOpdInline: v.visitId !== anchorVisitId,
      });

      if (hasTooth) out.push({ key: `${v.visitId}:T`, visitId: v.visitId, rowType: 'TOOTH_BLOCK' });

      if (hasDocNotes)
        out.push({ key: `${v.visitId}:N`, visitId: v.visitId, rowType: 'DOCTOR_NOTES' });

      if (hasMeds) {
        for (let i = 0; i < v.lines.length; i++) {
          out.push({
            key: `${v.visitId}:M:${i}`,
            visitId: v.visitId,
            rowType: 'MED_LINE',
            medIndex: i,
          });
        }
      }

      out.push({ key: `${v.visitId}:D`, visitId: v.visitId, rowType: 'DIVIDER' });
    }

    return out;
  }, [historyEnabled, visitsData, anchorVisitId]);

  const measureRootRef = useRef<HTMLDivElement | null>(null);
  const [rowHeightsByKey, setRowHeightsByKey] = useState<Record<string, number>>({});

  const shouldMeasure = historyEnabled;

  const capOdd = useMemo(() => {
    const base = BASE_H - headerH - footerH - patientInfoH - CONTENT_PT_ODD - CONTENT_PB_ODD;
    return Math.max(160, Math.floor(base));
  }, [BASE_H, headerH, footerH, patientInfoH]);

  const capEven = useMemo(() => {
    const base = BASE_H - CONTENT_PT_EVEN - CONTENT_PB_EVEN;
    return Math.max(200, Math.floor(base));
  }, [BASE_H]);

  const [pages, setPages] = useState<PageModel[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!historyEnabled) return;
    setPage((p) => p);
  }, [historyEnabled, chainKey]);

  const measureTemplate = shouldMeasure ? (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0"
      style={{ width: 0, height: 0, overflow: 'hidden', opacity: 0 }}
    >
      <div style={{ width: BASE_W }}>
        <div
          className="w-full overflow-hidden border bg-white"
          style={{ height: BASE_H, position: 'relative' }}
        >
          <div style={{ paddingTop: 0, paddingBottom: 0 }}>
            <div ref={measureRootRef} className="px-6">
              {(() => {
                const grouped = new Map<string, RowModel[]>();
                for (const r of rows)
                  grouped.set(r.visitId, [...(grouped.get(r.visitId) ?? []), r]);

                const orderedVisitIds: string[] = [];
                for (const r of rows)
                  if (!orderedVisitIds.includes(r.visitId)) orderedVisitIds.push(r.visitId);

                return orderedVisitIds.map((vid) => {
                  const v = vById.get(vid);
                  if (!v) return null;
                  const rset = grouped.get(vid) ?? [];

                  const headerRows = rset.filter((r) => r.rowType === 'VISIT_HEADER');
                  const toothRows = rset.filter((r) => r.rowType === 'TOOTH_BLOCK');
                  const notesRows = rset.filter((r) => r.rowType === 'DOCTOR_NOTES');
                  const medRows = rset.filter((r) => r.rowType === 'MED_LINE');
                  const dividerRows = rset.filter((r) => r.rowType === 'DIVIDER');

                  const medIdxs = medRows
                    .map((r) => r.medIndex)
                    .filter((x): x is number => typeof x === 'number' && x >= 0);

                  const leftHasAny = toothRows.length > 0 || notesRows.length > 0;
                  const dateText = v.visitDate ? formatClinicDateDDMMYYYY(v.visitDate) : '—';

                  return (
                    <div key={`measure:${vid}`} className="w-full">
                      {headerRows.map((r) => (
                        <VisitRowRenderer
                          key={r.key}
                          v={v}
                          row={r}
                          medIndexesOnPage={medIdxs}
                          medNumberOffset={0}
                          hideVisitDate={true}
                        />
                      ))}

                      <div className="grid grid-cols-[1fr_360px] gap-6">
                        <div className="min-w-0 pl-4">
                          {leftHasAny ? (
                            <>
                              {/* date + tooth block (notes are rendered full-width below) */}
                              <div className="flex items-start gap-2">
                                <div className="w-[60px] shrink-0 text-[13px] font-bold text-black tracking-wide">
                                  {dateText}
                                </div>

                                <div className="min-w-0 flex-1">
                                  {toothRows.map((r) => (
                                    <VisitRowRenderer
                                      key={r.key}
                                      v={v}
                                      row={r}
                                      medIndexesOnPage={medIdxs}
                                      medNumberOffset={0}
                                      hideVisitDate={true}
                                    />
                                  ))}
                                </div>
                              </div>

                              {/* ✅ Doctor notes: start from same left edge as date */}
                              {notesRows.map((r) => (
                                <VisitRowRenderer
                                  key={r.key}
                                  v={v}
                                  row={r}
                                  medIndexesOnPage={medIdxs}
                                  medNumberOffset={0}
                                  hideVisitDate={true}
                                />
                              ))}
                            </>
                          ) : null}
                        </div>

                        <div className="min-w-0">
                          {medRows.map((r) => (
                            <VisitRowRenderer
                              key={r.key}
                              v={v}
                              row={r}
                              medIndexesOnPage={medIdxs}
                              medNumberOffset={0}
                              hideVisitDate={true}
                            />
                          ))}
                        </div>
                      </div>

                      {dividerRows.map((r) => (
                        <VisitRowRenderer
                          key={r.key}
                          v={v}
                          row={r}
                          medIndexesOnPage={medIdxs}
                          medNumberOffset={0}
                          hideVisitDate={true}
                        />
                      ))}
                    </div>
                  );
                });
              })()}

              {hasNotes ? <ReceptionNotesRow text={receptionNotes!.trim()} /> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  useEffect(() => {
    if (!shouldMeasure) {
      setRowHeightsByKey({});
      return;
    }

    const root = measureRootRef.current;
    if (!root) return;

    const doMeasure = () => {
      const els = Array.from(root.querySelectorAll('[data-rx-row="1"]')) as HTMLElement[];

      const next: Record<string, number> = {};
      for (const el of els) {
        const key = el.getAttribute('data-row-key') ?? '';
        if (!key) continue;
        const rectH = Math.ceil(el.getBoundingClientRect().height);
        const cs = window.getComputedStyle(el);
        const mt = Number.parseFloat(cs.marginTop || '0') || 0;
        const mb = Number.parseFloat(cs.marginBottom || '0') || 0;
        next[key] = Math.ceil(rectH + mt + mb);
      }
      setRowHeightsByKey(next);
    };

    let rafId = 0;
    const schedule = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => doMeasure());
    };

    doMeasure();
    schedule();

    if ((document as any).fonts?.ready) {
      (document as any).fonts.ready.then(() => schedule());
    }

    const ro = new ResizeObserver(() => schedule());
    ro.observe(root);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [shouldMeasure, rows.length, hasNotes, receptionNotes]);

  useEffect(() => {
    if (!historyEnabled) {
      setPages([]);
      return;
    }
    if (!rows.length) {
      setPages([]);
      return;
    }
    if (!Object.keys(rowHeightsByKey).length) {
      setPages([{ kind: 'ODD', rows }]);
      return;
    }

    const SAFETY = 8;
    const capOddSafe = Math.max(120, capOdd - SAFETY);
    const capEvenSafe = Math.max(140, capEven - SAFETY);

    type VisitBlock = {
      visitId: string;
      rows: RowModel[];
      keyToIndex: Map<string, number>;
      totalHeightOddEven: number;
    };

    const blocks: VisitBlock[] = [];
    {
      let i = 0;
      while (i < rows.length) {
        const vid = rows[i]?.visitId;
        if (!vid) {
          i++;
          continue;
        }

        const rset: RowModel[] = [];
        while (i < rows.length && rows[i].visitId === vid) {
          const r = rows[i];
          rset.push(r);
          i++;
          if (r.rowType === 'DIVIDER') break;
        }

        const keyToIndex = new Map<string, number>();
        rset.forEach((r, idx) => keyToIndex.set(r.key, idx));

        const computeSliceHeight = (start: number, endExclusive: number) => {
          let full = 0;
          let left = 0;
          let right = 0;

          for (let k = start; k < endExclusive; k++) {
            const rr = rset[k];
            const h = rowHeightsByKey[rr.key] ?? 0;

            if (rr.rowType === 'VISIT_HEADER' || rr.rowType === 'DIVIDER') full += h;
            else if (rr.rowType === 'TOOTH_BLOCK' || rr.rowType === 'DOCTOR_NOTES') left += h;
            else if (rr.rowType === 'MED_LINE') right += h;
          }

          return full + Math.max(left, right);
        };

        const totalHeight = computeSliceHeight(0, rset.length);
        blocks.push({ visitId: vid, rows: rset, keyToIndex, totalHeightOddEven: totalHeight });
      }
    }

    const blockById = new Map<string, VisitBlock>();
    for (const b of blocks) blockById.set(b.visitId, b);

    const result: PageModel[] = [];
    let kind: PageKind = 'ODD';

    let vIdx = 0;
    let off = 0;

    const sliceHeight = (b: VisitBlock, start: number, endExclusive: number) => {
      let full = 0;
      let left = 0;
      let right = 0;

      for (let k = start; k < endExclusive; k++) {
        const rr = b.rows[k];
        const h = rowHeightsByKey[rr.key] ?? 0;

        if (rr.rowType === 'VISIT_HEADER' || rr.rowType === 'DIVIDER') full += h;
        else if (rr.rowType === 'TOOTH_BLOCK' || rr.rowType === 'DOCTOR_NOTES') left += h;
        else if (rr.rowType === 'MED_LINE') right += h;
      }

      return full + Math.max(left, right);
    };

    const maxPrefixThatFits = (b: VisitBlock, start: number, cap: number) => {
      let bestCount = 0;
      let bestH = 0;

      for (let k = 1; start + k <= b.rows.length; k++) {
        const h = sliceHeight(b, start, start + k);
        if (h <= cap) {
          bestCount = k;
          bestH = h;
          continue;
        }
        break;
      }

      return { count: bestCount, height: bestH };
    };

    const computePageUsedHeight = (pageRows: RowModel[]) => {
      let used = 0;

      let i = 0;
      while (i < pageRows.length) {
        const vid = pageRows[i]!.visitId;
        const b = blockById.get(vid);
        if (!b) {
          i++;
          continue;
        }

        const seg: RowModel[] = [];
        while (i < pageRows.length && pageRows[i]!.visitId === vid) {
          seg.push(pageRows[i]!);
          i++;
        }

        const idxs = seg
          .map((r) => b.keyToIndex.get(r.key))
          .filter((x): x is number => typeof x === 'number');

        if (!idxs.length) continue;

        const start = Math.min(...idxs);
        const end = Math.max(...idxs) + 1;

        used += sliceHeight(b, start, end);
      }

      return used;
    };

    while (vIdx < blocks.length) {
      const cap = kind === 'ODD' ? capOddSafe : capEvenSafe;

      const pageRows: RowModel[] = [];
      let used = 0;

      if (kind === 'ODD') {
        while (vIdx < blocks.length) {
          const b = blocks[vIdx]!;
          const remainingCap = cap - used;

          let { count, height } = maxPrefixThatFits(b, off, remainingCap);

          if (count <= 0 && pageRows.length === 0 && off < b.rows.length) {
            count = 1;
            height = sliceHeight(b, off, off + 1);
          }

          if (count <= 0) break;

          pageRows.push(...b.rows.slice(off, off + count));
          used += height;
          off += count;

          if (off >= b.rows.length) {
            vIdx++;
            off = 0;
            continue;
          }

          break;
        }

        result.push({ kind, rows: pageRows });
        kind = 'EVEN';
        continue;
      }

      if (off > 0) {
        const b = blocks[vIdx]!;
        const remainingCap = cap - used;

        let { count, height } = maxPrefixThatFits(b, off, remainingCap);

        if (count <= 0 && pageRows.length === 0 && off < b.rows.length) {
          count = 1;
          height = sliceHeight(b, off, off + 1);
        }

        if (count > 0) {
          pageRows.push(...b.rows.slice(off, off + count));
          used += height;
          off += count;
        }

        if (off >= b.rows.length) {
          vIdx++;
          off = 0;
        } else {
          result.push({ kind, rows: pageRows });
          kind = 'ODD';
          continue;
        }
      }

      while (vIdx < blocks.length) {
        const b = blocks[vIdx]!;
        if (b.totalHeightOddEven > capEvenSafe) break;

        if (b.totalHeightOddEven <= cap - used) {
          pageRows.push(...b.rows);
          used += b.totalHeightOddEven;
          vIdx++;
          off = 0;
          continue;
        }

        break;
      }

      result.push({ kind, rows: pageRows });
      kind = 'ODD';
    }

    if (hasNotes) {
      const last = result[result.length - 1];
      const receptionKey = 'RECEPTION_NOTES';
      const receptionHeight = rowHeightsByKey[receptionKey] ?? 0;

      if (!last) {
        result.push({ kind: 'ODD', rows: [] });
      } else {
        const lastCap = last.kind === 'ODD' ? capOddSafe : capEvenSafe;
        const usedLast = computePageUsedHeight(last.rows);

        if (usedLast + receptionHeight > lastCap) {
          const nextKind: PageKind = last.kind === 'ODD' ? 'EVEN' : 'ODD';
          result.push({ kind: nextKind, rows: [] });
        }
      }
    }

    setPages(result);
  }, [historyEnabled, rows, rowHeightsByKey, capOdd, capEven, hasNotes, receptionNotes]);

  useEffect(() => {
    const total = pages.length || 1;

    if (historyEnabled && !currentOnly && total > 1) {
      setPage(total);
      return;
    }

    setPage((prev) => {
      if (prev < 1) return 1;
      if (prev > total) return total;
      return prev;
    });
  }, [pages.length, historyEnabled, currentOnly]);

  useEffect(() => {
    if (!historyEnabled) return;
    if (!currentOnly) return;
    if (!pages.length) return;

    const idx = pages.findIndex((p) => p.rows.some((r) => r.visitId === currentVisitId));
    if (idx >= 0) setPage(idx + 1);
  }, [currentOnly, historyEnabled, pages, currentVisitId]);

  const activePage = pages[Math.max(0, page - 1)] ?? ({ kind: 'ODD' as const, rows } as PageModel);

  useEffect(() => {
    onActivePageKindChange?.(activePage.kind);
  }, [activePage.kind, onActivePageKindChange]);

  const headerFooterHiddenStyle: React.CSSProperties | undefined = currentOnly
    ? { visibility: 'hidden' }
    : !showPrintHeader
      ? { visibility: 'hidden' }
      : undefined;

  const patientInfoHiddenStyle: React.CSSProperties | undefined = currentOnly
    ? { visibility: 'hidden' }
    : undefined;

  const Header = (
    <div className="px-2 pt-8 pb-3" style={headerFooterHiddenStyle}>
      <div className="flex items-stretch justify-between gap-6 px-7">
        <div className="relative h-30 w-30 shrink-0">
          <Image
            src="/rx-logo-r.png"
            alt="Rx Logo"
            fill
            className="object-contain"
            priority
            unoptimized
          />
        </div>

        <div className="flex w-full items-center justify-center gap-16 text-center text-black">
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

        <div className="relative h-26 w-48 shrink-0 right-2">
          <Image
            src="/dashboard-logo.png"
            alt="Sarangi Dentistry"
            fill
            className="object-contain"
            priority
            unoptimized
          />
        </div>
      </div>

      <div className="mt-3 h-0.5 w-full bg-emerald-700/70" />

      <div className="mt-5 flex items-start justify-between gap-6 px-5 text-black">
        <div className="min-w-0 flex flex-col">
          <div className="text-[1rem] font-bold">Dr. Soumendra Sarangi</div>
          <div className="mt-0.5 text-[0.82rem] font-medium">B.D.S. Regd. - 68</div>
        </div>

        <div className="min-w-0 flex flex-col">
          <div className="text-[1rem] font-bold text-black">Dr. Vaishnovee Sarangi</div>
          <div className="mt-0.5 text-[0.82rem] font-medium">B.D.S. Redg. - 3057</div>
        </div>
      </div>
    </div>
  );

  const PatientInfo = (
    <div className="px-2 text-black" style={patientInfoHiddenStyle}>
      <div className="grid grid-cols-2 gap-40 px-6 text-black">
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

        <div className="space-y-2 text-[0.8rem] text-black">
          <div className="flex gap-3">
            <div className="w-16 font-medium">Regd. Date</div>
            <div className="text-black">:</div>
            <div className="font-semibold">{headerRegdDate}</div>
          </div>

          <div className="flex gap-3">
            <div className="w-16 font-medium">SD-ID</div>
            <div>:</div>
            <div className="font-semibold">{sdId ?? '—'}</div>
          </div>

          <div className="flex gap-3">
            <div className="w-16 font-medium">OPD No.</div>
            <div>:</div>
            <div className="font-semibold">{headerOpdNo}</div>
          </div>
        </div>
      </div>

      <div className="my-3 h-0.5 w-full bg-gray-900/30" />
    </div>
  );

  const Footer = (
    <div className="px-2 pb-8" style={headerFooterHiddenStyle}>
      <div className="h-0.5 w-full bg-emerald-700/70" />

      <div className="flex items-start justify-between gap-8 px-7">
        <div className="mt-2 text-[0.90rem] text-black">
          {ADDRESS_LEFT.map((l) => (
            <div key={l} className="leading-5">
              {l}
            </div>
          ))}
        </div>

        <div>
          <div className="mt-2 flex text-left text-[15px] font-bold text-emerald-700/70">
            <div className="tracking-[0.35em]">CLINIC HOUR</div>
            <div>S</div>
          </div>
          {CLINIC_HOURS_TIMING.map((l) => (
            <div key={l} className="text-right text-[15px] leading-5 tracking-[0.05em]">
              {l}
            </div>
          ))}
          <div className="flex text-left text-[15px] font-bold text-red-500">
            <div className="tracking-[0.24em]">SUNDAY CLOSE</div>
            <div>D</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHistoryPage = (pm: PageModel) => {
    const visibleRows = (() => {
      const src = pm.rows ?? [];
      if (pm.kind !== 'ODD') return src;

      let start = 0;
      while (start < src.length && src[start]?.rowType === 'DIVIDER') start++;

      let end = src.length;
      while (end > start && src[end - 1]?.rowType === 'DIVIDER') end--;

      return src.slice(start, end);
    })();

    const grouped = new Map<string, RowModel[]>();
    for (const r of visibleRows) grouped.set(r.visitId, [...(grouped.get(r.visitId) ?? []), r]);

    const orderedVisitIdsOnPage: string[] = [];
    for (const r of visibleRows)
      if (!orderedVisitIdsOnPage.includes(r.visitId)) orderedVisitIdsOnPage.push(r.visitId);

    return (
      <div className="px-6">
        <div className="space-y-3">
          {orderedVisitIdsOnPage.map((vid) => {
            const v = vById.get(vid);
            if (!v) return null;

            const rset = grouped.get(vid) ?? [];

            const headerRows = rset.filter((r) => r.rowType === 'VISIT_HEADER');
            const toothRows = rset.filter((r) => r.rowType === 'TOOTH_BLOCK');
            const notesRows = rset.filter((r) => r.rowType === 'DOCTOR_NOTES');
            const dividerRows = rset.filter((r) => r.rowType === 'DIVIDER');
            const medRows = rset.filter((r) => r.rowType === 'MED_LINE');

            const medIdxs = medRows
              .map((r) => r.medIndex)
              .filter((x): x is number => typeof x === 'number' && x >= 0);

            const prevOffset = (() => {
              if (page <= 1) return 0;
              let count = 0;
              for (let p = 0; p < page - 1; p++) {
                const pr = pages[p]?.rows ?? [];
                for (const rr of pr) {
                  if (rr.visitId !== vid) continue;
                  if (rr.rowType === 'MED_LINE') count++;
                }
              }
              return count;
            })();

            const hideBlock =
              currentOnly && vid !== currentVisitId
                ? ({ visibility: 'hidden' } as React.CSSProperties)
                : undefined;

            const hasRightMeds = medRows.length > 0;
            const hasLeftAny = toothRows.length > 0 || notesRows.length > 0;

            const dateText = v.visitDate ? formatClinicDateDDMMYYYY(v.visitDate) : '—';

            return (
              <div key={`vpage:${vid}:${page}`} style={hideBlock}>
                {headerRows.map((r) => (
                  <VisitRowRenderer
                    key={r.key}
                    v={v}
                    row={r}
                    medIndexesOnPage={medIdxs}
                    medNumberOffset={prevOffset}
                    hideVisitDate={true}
                  />
                ))}

                {(hasLeftAny || hasRightMeds) && (
                  <div className="grid grid-cols-[1fr_360px] gap-6">
                    <div className="min-w-0">
                      {hasLeftAny ? (
                        <>
                          {/* date + tooth block (notes are full-width below) */}
                          <div className="flex items-start gap-2">
                            <div className="w-[96px] shrink-0 text-[16px] font-bold text-black tracking-wide">
                              {dateText}
                            </div>

                            <div className="min-w-0 flex-1">
                              {toothRows.map((r) => (
                                <VisitRowRenderer
                                  key={r.key}
                                  v={v}
                                  row={r}
                                  medIndexesOnPage={medIdxs}
                                  medNumberOffset={prevOffset}
                                  hideVisitDate={true}
                                />
                              ))}
                            </div>
                          </div>

                          {/* ✅ Doctor notes: start from same left edge as date */}
                          {notesRows.map((r) => (
                            <VisitRowRenderer
                              key={r.key}
                              v={v}
                              row={r}
                              medIndexesOnPage={medIdxs}
                              medNumberOffset={prevOffset}
                              hideVisitDate={true}
                            />
                          ))}
                        </>
                      ) : null}
                    </div>

                    <div className="min-w-0">
                      {medRows.map((r) => (
                        <VisitRowRenderer
                          key={r.key}
                          v={v}
                          row={r}
                          medIndexesOnPage={medIdxs}
                          medNumberOffset={prevOffset}
                          hideVisitDate={true}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {dividerRows.map((r) => (
                  <VisitRowRenderer
                    key={r.key}
                    v={v}
                    row={r}
                    medIndexesOnPage={medIdxs}
                    medNumberOffset={prevOffset}
                    hideVisitDate={true}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {hasNotes ? <ReceptionNotesRow text={receptionNotes!.trim()} /> : null}
      </div>
    );
  };

  const renderNonHistory = () => {
    const hasTooth = currentToothDetails.length > 0;
    const hasMeds = lines.length > 0;
    const hasDocNotes = !!doctorNotes?.trim();

    return (
      <div className="px-6">
        <div className="grid grid-cols-[1fr_360px] gap-6">
          <div className="min-w-0 pl-4">
            {hasTooth ? (
              <div className="mb-2">
                <div className="min-w-0 whitespace-normal">
                  <ToothDetailsBlock toothDetails={currentToothDetails} />
                </div>
              </div>
            ) : null}

            {hasDocNotes ? (
              <div className="mt-2 text-[16px] leading-5 text-black">
                <span className="font-semibold">Notes: </span>
                <span className="whitespace-pre-line">{doctorNotes!.trim()}</span>
              </div>
            ) : null}
          </div>

          <div className="min-w-0">
            {hasMeds ? (
              <div className="text-black">
                {lines.map((l, idx) => (
                  <MedicineLineBlock
                    key={idx}
                    line={l}
                    number={idx + 1}
                    wrapperClassName="mb-6 ml-4"
                    typeColClassName="w-[58px] shrink-0 whitespace-normal text-[11px] font-medium text-right"
                    numberColClassName="w-5 shrink-0 text-right font-medium"
                    instrWrapperClassName="mt-0.5 flex items-start text-[12px] leading-4 text-black"
                    instrNumberSpacerClassName="w-5 shrink-0"
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const headerFooterHiddenStyle2: React.CSSProperties | undefined = currentOnly
    ? { visibility: 'hidden' }
    : !showPrintHeader
      ? { visibility: 'hidden' }
      : undefined;

  const patientInfoHiddenStyle2: React.CSSProperties | undefined = currentOnly
    ? { visibility: 'hidden' }
    : undefined;

  return (
    <div className="w-full rx-preview">
      {Fetchers}
      {measureTemplate}

      <div ref={wrapRef} className="w-full">
        <div
          className="rx-preview-viewport relative mx-auto w-full"
          style={{
            maxWidth: BASE_W,
            aspectRatio: `${BASE_W} / ${BASE_H}`,
          }}
        >
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="rx-canvas origin-top-left"
              style={{ width: BASE_W, height: BASE_H, transform: `scale(${scale})` }}
            >
              <div
                className="rx-page h-full w-full overflow-hidden rounded-xl border bg-white shadow-sm"
                style={{ fontFamily: 'var(--font-footlight), serif' }}
              >
                <div className="relative h-full w-full">
                  <div
                    ref={headerRef}
                    className="absolute left-0 top-0 z-10 w-full"
                    style={{ display: activePage.kind === 'ODD' ? 'block' : 'none' }}
                  >
                    <div className="px-2 pt-8 pb-3" style={headerFooterHiddenStyle2}>
                      {Header}
                    </div>
                  </div>

                  <div
                    ref={footerRef}
                    className="absolute bottom-0 left-0 z-10 w-full"
                    style={{ display: activePage.kind === 'ODD' ? 'block' : 'none' }}
                  >
                    <div className="px-2 pb-8" style={headerFooterHiddenStyle2}>
                      {Footer}
                    </div>
                  </div>

                  <div
                    className="relative z-0 h-full w-full"
                    style={
                      activePage.kind === 'ODD'
                        ? {
                            paddingTop: headerH + CONTENT_PT_ODD,
                            paddingBottom: footerH + CONTENT_PB_ODD,
                          }
                        : { paddingTop: CONTENT_PT_EVEN, paddingBottom: CONTENT_PB_EVEN }
                    }
                  >
                    <div className="h-full w-full">
                      <div
                        ref={patientInfoRef}
                        style={{ display: activePage.kind === 'ODD' ? 'block' : 'none' }}
                      >
                        <div className="px-2 text-black" style={patientInfoHiddenStyle2}>
                          {PatientInfo}
                        </div>
                      </div>

                      {!historyEnabled ? renderNonHistory() : renderHistoryPage(activePage)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {historyEnabled && !currentOnly ? (
          <PaginationBar page={page} total={pages.length || 1} onChange={setPage} />
        ) : null}
      </div>
    </div>
  );
}
