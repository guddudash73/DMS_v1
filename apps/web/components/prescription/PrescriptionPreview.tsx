'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import type { RxLineType, Visit, ToothDetail } from '@dcm/types';
import { clinicDateISO, formatClinicDateShort } from '@/src/lib/clinicTime';
import { useGetVisitRxQuery } from '@/src/store/api';
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
  visitDateLabel?: string;
  lines: RxLineType[];
  receptionNotes?: string;

  currentVisitId?: string;
  chainVisitIds?: string[];
  visitMetaMap?: Map<string, Visit>;

  toothDetails?: ToothDetail[];

  /**
   * ✅ When true:
   * - show ONLY the current visit’s block
   * - keep its vertical position exactly the same as history mode
   * - hide header + pagination
   */
  currentOnly?: boolean;
};

const FREQ_LABEL: Record<RxLineType['frequency'], string> = {
  QD: 'Once Daily',
  BID: 'Twice Daily',
  TID: 'Thrice Daily',
  QID: 'Four Times Daily',
  HS: 'At Bedtime',
  PRN: 'As Needed',
};

const TIMING_LABEL: Record<NonNullable<RxLineType['timing']>, string> = {
  BEFORE_MEAL: 'before food',
  AFTER_MEAL: 'After food',
  ANY: '',
};

function buildLineText(l: RxLineType) {
  const parts: string[] = [];
  const med = [l.medicine, l.dose].filter(Boolean).join(' ').trim();
  if (med) parts.push(med);

  const freq = l.frequency ? `${l.frequency}(${FREQ_LABEL[l.frequency]})` : '';
  const timing = l.timing ? TIMING_LABEL[l.timing] : '';
  const freqTiming = [freq, timing].filter(Boolean).join(' ').trim();
  if (freqTiming) parts.push(`- ${freqTiming}`);

  if (typeof l.duration === 'number' && l.duration > 0) parts.push(`For ${l.duration} days.`);
  if (l.notes?.trim()) parts.push(l.notes.trim());
  return parts.join(' ');
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

function extractIsoFromVisitLabel(visitDateLabel?: string): string | null {
  if (!visitDateLabel) return null;

  const raw = visitDateLabel.trim().startsWith('Visit:')
    ? visitDateLabel.replace('Visit:', '').trim()
    : visitDateLabel.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
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

function VisitRxPreviewBlock(props: {
  visitId: string;
  isCurrent: boolean;
  currentLines: RxLineType[];
  visit?: Visit;
  showOpdInline?: boolean;
  opdInlineText?: string;
  currentToothDetails: ToothDetail[];
}) {
  const {
    visitId,
    isCurrent,
    currentLines,
    visit,
    showOpdInline,
    opdInlineText,
    currentToothDetails,
  } = props;

  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: isCurrent || !visitId });

  const lines = isCurrent ? currentLines : (rxQuery.data?.rx?.lines ?? []);
  const toothDetails = isCurrent ? currentToothDetails : (rxQuery.data?.rx?.toothDetails ?? []);

  const visitDate = getMetaString(visit, 'visitDate');
  const reason = getMetaString(visit, 'reason');

  const hasToothDetails = (toothDetails?.length ?? 0) > 0;

  if (!lines.length && !reason && !visitDate && !hasToothDetails) return <div className="h-2" />;

  return (
    <div className="rx-prev-block">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-[12px] font-bold text-gray-900">
          {visitDate ? formatClinicDateShort(visitDate) : '—'}
        </div>

        <div className="ml-4 flex min-w-0 flex-1 items-baseline justify-end gap-3">
          <div className="min-w-0 flex-1 truncate text-right text-[11px] font-medium text-gray-700">
            {reason?.trim() ? reason.trim() : ''}
          </div>

          {showOpdInline && opdInlineText ? (
            <div className="shrink-0 text-right text-[11px] font-semibold text-gray-900">
              {opdInlineText}
            </div>
          ) : null}
        </div>
      </div>

      {hasToothDetails ? (
        <div className="mb-2">
          <ToothDetailsBlock toothDetails={toothDetails} />
        </div>
      ) : null}

      {lines.length === 0 ? (
        <div className="text-[12px] text-gray-500">No medicines recorded.</div>
      ) : (
        <ol className="space-y-1 text-[13px] leading-5 text-gray-900">
          {lines.map((l, idx) => (
            <li key={idx} className="flex gap-2">
              <div className="w-5 shrink-0 text-right font-medium">{idx + 1}.</div>
              <div className="font-medium">{buildLineText(l)}</div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 h-px w-full bg-gray-200" />
    </div>
  );
}

function PaginationBar(props: { page: number; total: number; onChange: (p: number) => void }) {
  const { page, total, onChange } = props;
  if (total <= 1) return null;

  const mkBtn = (active: boolean, disabled?: boolean) =>
    [
      'h-8 min-w-8 rounded-lg border px-2 text-xs font-semibold transition',
      disabled ? 'opacity-50 cursor-not-allowed' : '',
      active ? 'bg-black text-white border-black' : 'bg-white text-gray-800 hover:bg-gray-50',
    ].join(' ');

  return (
    <div className="mt-3 flex items-center justify-center gap-2">
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

export function PrescriptionPreview({
  patientName,
  patientPhone,
  patientAge,
  patientSex,
  sdId,
  opdNo,
  visitDateLabel,
  lines,
  receptionNotes,

  currentVisitId: currentVisitIdProp,
  chainVisitIds: chainVisitIdsProp,
  visitMetaMap: visitMetaMapProp,

  toothDetails: toothDetailsProp,

  currentOnly = false,
}: Props) {
  const hasNotes = !!receptionNotes?.trim();
  const ageSex = formatAgeSex(patientAge, patientSex);

  const visitISO = useMemo(
    () => extractIsoFromVisitLabel(visitDateLabel) ?? clinicDateISO(new Date()),
    [visitDateLabel],
  );

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

  const CONTACT_NUMBER = '9938942846';
  const ADDRESS_ONE_LINE = 'A-33, STALWART COMPLEX, UNIT - IV, BHUBANESWAR';
  const CLINIC_HOURS =
    'Clinic hours: 10 : 00 AM - 01 : 30 PM & 06 : 00 PM - 08:00 PM, Sunday Closed';

  const BASE_W = 760;
  const BASE_H = Math.round((BASE_W * 297) / 210);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? BASE_W;
      const next = Math.min(1, w / BASE_W);
      setScale(Number.isFinite(next) && next > 0 ? next : 1);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const currentToothDetails = useMemo(() => toothDetailsProp ?? [], [toothDetailsProp]);
  const showCurrentToothDetails = !historyEnabled && currentToothDetails.length > 0;

  // ---------------------------------------
  // Pagination + "perfect fit" measurement
  // ---------------------------------------
  const measureContainerRef = useRef<HTMLDivElement | null>(null);
  const measureFirstCapRef = useRef<HTMLDivElement | null>(null);
  const measureNextCapRef = useRef<HTMLDivElement | null>(null);
  const measureNotesRef = useRef<HTMLDivElement | null>(null);

  const [blockHeights, setBlockHeights] = useState<number[]>([]);
  const [capFirst, setCapFirst] = useState<number>(560);
  const [capNext, setCapNext] = useState<number>(980);
  const [notesH, setNotesH] = useState<number>(0);

  const [pages, setPages] = useState<string[][]>([chainVisitIds]);
  const [page, setPage] = useState(1);

  const measureKey = useMemo(() => {
    return [
      historyEnabled ? 'H' : 'N',
      chainVisitIds.join(','),
      String(lines.length),
      String(currentToothDetails.length),
      String(receptionNotes?.length ?? 0),
    ].join('|');
  }, [historyEnabled, chainVisitIds, lines.length, currentToothDetails.length, receptionNotes]);

  const shouldMeasure = historyEnabled && chainVisitIds.length > 1;

  // reset page when chain changes (normal mode)
  useEffect(() => {
    if (!currentOnly) setPage(1);
  }, [currentOnly, historyEnabled, chainVisitIds.join('|')]);

  useEffect(() => {
    if (!shouldMeasure) {
      setPages([chainVisitIds]);
      return;
    }

    const root = measureContainerRef.current;
    if (!root) return;

    const measure = () => {
      if (measureFirstCapRef.current) {
        const h = measureFirstCapRef.current.getBoundingClientRect().height;
        if (Number.isFinite(h) && h > 0) setCapFirst(Math.floor(h));
      }
      if (measureNextCapRef.current) {
        const h = measureNextCapRef.current.getBoundingClientRect().height;
        if (Number.isFinite(h) && h > 0) setCapNext(Math.floor(h));
      }
      if (measureNotesRef.current) {
        const h = measureNotesRef.current.getBoundingClientRect().height;
        setNotesH(Number.isFinite(h) && h > 0 ? Math.ceil(h) : 0);
      }

      const kids = Array.from(root.querySelectorAll('[data-rx-block="1"]')) as HTMLElement[];

      const heights = kids.map((k) => {
        const rectH = Math.ceil(k.getBoundingClientRect().height);
        const cs = window.getComputedStyle(k);
        const mt = Number.parseFloat(cs.marginTop || '0') || 0;
        const mb = Number.parseFloat(cs.marginBottom || '0') || 0;
        return Math.ceil(rectH + mt + mb);
      });

      setBlockHeights(heights);
    };

    measure();
    requestAnimationFrame(() => measure());
    if ((document as any).fonts?.ready) {
      (document as any).fonts.ready.then(() => requestAnimationFrame(() => measure()));
    }

    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    return () => ro.disconnect();
  }, [shouldMeasure, measureKey]);

  useEffect(() => {
    if (!historyEnabled || !shouldMeasure) {
      setPages([chainVisitIds]);
      return;
    }
    if (!blockHeights.length || blockHeights.length !== chainVisitIds.length) {
      setPages([chainVisitIds]);
      return;
    }

    const SAFETY = 10;

    // greedy split
    let result: string[][] = [];
    {
      let cur: string[] = [];
      let used = 0;
      let cap = capFirst;

      for (let i = 0; i < chainVisitIds.length; i++) {
        const id = chainVisitIds[i];
        const h = blockHeights[i] ?? 0;

        if (cur.length > 0 && used + h > cap - SAFETY) {
          result.push(cur);
          cur = [];
          used = 0;
          cap = capNext;
        }

        cur.push(id);
        used += h;
      }
      if (cur.length) result.push(cur);
      if (!result.length) result = [chainVisitIds];
    }

    // backfill gaps (pull from next page if fits)
    const getHeightById = (id: string) => {
      const idx = chainVisitIds.indexOf(id);
      return idx >= 0 ? (blockHeights[idx] ?? 0) : 0;
    };
    const computeUsed = (pageIds: string[]) => pageIds.reduce((s, id) => s + getHeightById(id), 0);

    for (let pass = 0; pass < 3; pass++) {
      for (let p = 0; p < result.length - 1; p++) {
        const cap = p === 0 ? capFirst : capNext;

        while (result[p + 1].length > 0) {
          const nextId = result[p + 1][0];
          const h = getHeightById(nextId);
          const used = computeUsed(result[p]);

          if (used + h <= cap - SAFETY) {
            result[p].push(nextId);
            result[p + 1].shift();
          } else break;
        }
      }
      result = result.filter((x) => x.length > 0);
      if (!result.length) result = [chainVisitIds];
    }

    // last page notes shrink (keep it simple: if notes exist, ensure last page isn't overstuffed)
    if (hasNotes && notesH > 0 && result.length > 0) {
      const lastIdx = result.length - 1;
      const lastCap = (lastIdx === 0 ? capFirst : capNext) - notesH;
      const used = computeUsed(result[lastIdx]);
      if (used > lastCap - SAFETY && result[lastIdx].length > 1) {
        const moved = result[lastIdx].pop();
        if (moved) result.push([moved]);
      }
    }

    setPages(result);
  }, [
    historyEnabled,
    shouldMeasure,
    chainVisitIds,
    blockHeights,
    capFirst,
    capNext,
    hasNotes,
    notesH,
  ]);

  // ✅ If currentOnly, jump to the page that contains currentVisitId
  useEffect(() => {
    if (!historyEnabled) return;
    if (!currentOnly) return;
    if (!pages.length) return;

    const idx = pages.findIndex((arr) => arr.includes(currentVisitId));
    if (idx >= 0) setPage(idx + 1);
  }, [currentOnly, historyEnabled, pages, currentVisitId]);

  useEffect(() => {
    const total = pages.length || 1;
    if (page > total) setPage(total);
    if (page < 1) setPage(1);
  }, [pages.length, page]);

  const totalPages = pages.length || 1;
  const visiblePageIds = pages[Math.max(0, page - 1)] ?? chainVisitIds;

  const hiddenStyle: React.CSSProperties | undefined = currentOnly
    ? { visibility: 'hidden' }
    : undefined;

  const renderNotes = () => {
    if (!hasNotes) return null;
    return (
      <div className="shrink-0 px-6 pb-2">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="text-[10px] font-semibold text-gray-700">Reception Notes</div>
          <div className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-gray-900">
            {receptionNotes}
          </div>
        </div>
      </div>
    );
  };

  const shouldShowNotesOnThisPage = hasNotes && page === totalPages && !currentOnly;
  const isFirstPage = page === 1;

  const renderHistoryBlocks = (ids: string[]) => {
    return (
      <div className="space-y-4">
        {ids.map((id) => {
          const v = visitMetaMap.get(id);
          const isAnchor = anchorVisitId != null && id === anchorVisitId;
          const opdInline = !isAnchor ? getVisitOpdNo(v) : undefined;

          const isCur = id === currentVisitId;

          return (
            <div
              key={id}
              data-rx-block="1"
              style={
                currentOnly && !isCur
                  ? ({ visibility: 'hidden' } as React.CSSProperties)
                  : undefined
              }
            >
              <VisitRxPreviewBlock
                visitId={id === 'CURRENT' ? '' : id}
                isCurrent={isCur}
                currentLines={lines}
                visit={v}
                showOpdInline={!isAnchor}
                opdInlineText={opdInline}
                currentToothDetails={currentToothDetails}
              />
            </div>
          );
        })}
      </div>
    );
  };

  const measureTemplate = shouldMeasure ? (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0"
      style={{ width: 0, height: 0, overflow: 'hidden', opacity: 0 }}
    >
      <div style={{ width: BASE_W }}>
        <div ref={measureContainerRef} className="w-full">
          <div className="h-270 w-full overflow-hidden border bg-white">
            <div className="flex h-full flex-col">
              <div className="shrink-0 px-6 pt-4">
                <div className="h-16 w-full" />
                <div className="mt-2 h-px w-full" />
              </div>
              <div className="shrink-0 px-6 pt-3">
                <div className="h-24 w-full" />
                <div className="mt-3 h-px w-full" />
              </div>
              <div className="min-h-0 flex-1 px-6 pt-4 pb-4">
                <div ref={measureFirstCapRef} className="h-full w-full" />
              </div>
              <div className="shrink-0 px-6 pb-2">
                <div ref={measureNotesRef} className="w-full">
                  {renderNotes()}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 h-270 w-full overflow-hidden border bg-white">
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1 px-6 pt-6 pb-4">
                <div ref={measureNextCapRef} className="h-full w-full" />
              </div>
            </div>
          </div>

          <div className="mt-8 px-6 pt-4">{renderHistoryBlocks(chainVisitIds)}</div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="w-full">
      {measureTemplate}

      <div ref={wrapRef} className="w-full">
        <div className="relative w-full" style={{ height: Math.ceil(BASE_H * scale) }}>
          <div
            className="origin-top-left"
            style={{ width: BASE_W, height: BASE_H, transform: `scale(${scale})` }}
          >
            <div className="h-full w-full overflow-hidden rounded-xl border bg-white shadow-sm">
              {isFirstPage ? (
                <div className="flex h-full flex-col">
                  {/* header (hidden in currentOnly but space preserved) */}
                  <div className="shrink-0 px-6 pt-4" style={hiddenStyle}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="relative h-16 w-16">
                        <Image
                          src="/rx-logo-r.png"
                          alt="Rx Logo"
                          fill
                          className="object-contain"
                          priority
                          unoptimized
                        />
                      </div>

                      <div className="mt-1 flex w-full flex-col items-center justify-center text-center">
                        <div className="text-[10px] font-semibold tracking-[0.30em] text-emerald-600">
                          CONTACT
                        </div>
                        <div className="text-[12px] font-semibold text-gray-900">
                          {CONTACT_NUMBER}
                        </div>

                        <div className="mt-1 max-w-130 text-[9px] font-medium leading-4 text-gray-700">
                          {ADDRESS_ONE_LINE}
                        </div>
                        <div className="max-w-130 text-[9px] font-medium leading-4 text-red-400 uppercase">
                          {CLINIC_HOURS}
                        </div>
                      </div>

                      <div className="relative h-14 w-38">
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

                    <div className="mt-2 h-px w-full bg-emerald-600/60" />
                  </div>

                  {/* doctor+patient band (hidden in currentOnly but space preserved) */}
                  <div className="shrink-0 px-6 pt-3" style={hiddenStyle}>
                    <div className="flex items-start justify-between gap-6">
                      <div className="min-w-0 flex flex-col">
                        <div className="text-[0.8rem] font-bold text-gray-900">
                          Dr. Soumendra Sarangi
                        </div>
                        <div className="mt-0 text-[0.7rem] font-light text-gray-700">
                          B.D.S. Regd. - 68
                        </div>
                      </div>

                      <div className="min-w-0 flex flex-col items-end text-right">
                        <div className="text-[0.8rem] font-bold text-gray-900">
                          Dr. Vaishnovee Sarangi
                        </div>
                        <div className="mt-0 text-[0.7rem] font-light text-gray-700">
                          B.D.S. Redg. - 3057
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex w-full justify-between gap-6">
                      <div className="space-y-0.5 text-[0.8rem] text-gray-800">
                        <div className="flex gap-3">
                          <div className="w-20 text-gray-600">Patient Name</div>
                          <div className="text-gray-600">:</div>
                          <div className="font-semibold text-gray-900">{patientName ?? '—'}</div>
                        </div>

                        <div className="flex gap-3">
                          <div className="w-20 text-gray-600">Contact No.</div>
                          <div className="text-gray-600">:</div>
                          <div className="font-semibold text-gray-900">{patientPhone ?? '—'}</div>
                        </div>

                        <div className="flex gap-3">
                          <div className="w-20 text-gray-600">Age/Sex</div>
                          <div className="text-gray-600">:</div>
                          <div className="font-semibold text-gray-900">{ageSex}</div>
                        </div>
                      </div>

                      <div className="w-[320px] justify-start space-y-0 text-[0.8rem]">
                        <div className="flex gap-3">
                          <div className="w-20 text-gray-600">Regd. Date</div>
                          <div className="text-gray-600">:</div>
                          <div className="font-semibold text-gray-900">{visitISO}</div>
                        </div>

                        <div className="flex gap-3">
                          <div className="w-20 text-gray-600">SD. ID</div>
                          <div className="text-gray-600">:</div>
                          <div className="font-semibold text-gray-900">{sdId ?? '—'}</div>
                        </div>

                        <div className="flex gap-3">
                          <div className="w-20 text-gray-600">OPD. No</div>
                          <div className="text-gray-600">:</div>
                          <div className="font-semibold text-gray-900">{headerOpdNo}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 h-px w-full bg-gray-900/30" />
                  </div>

                  <div className="min-h-0 flex-1 px-6 pt-4 pb-4">
                    {!historyEnabled ? (
                      <>
                        {showCurrentToothDetails ? (
                          <div className="mb-3">
                            <ToothDetailsBlock toothDetails={currentToothDetails} />
                            <div className="mt-3 h-px w-full bg-gray-200" />
                          </div>
                        ) : null}

                        {lines.length === 0 ? (
                          <div className="text-[13px] text-gray-500">No medicines added yet.</div>
                        ) : (
                          <ol className="text-sm leading-6 text-gray-900">
                            {lines.map((l, idx) => (
                              <li key={idx} className="flex gap-1">
                                <div className="w-4 shrink-0 text-right font-medium">
                                  {idx + 1}.
                                </div>
                                <div className="font-medium">{buildLineText(l)}</div>
                              </li>
                            ))}
                          </ol>
                        )}
                      </>
                    ) : (
                      renderHistoryBlocks(visiblePageIds)
                    )}
                  </div>

                  {shouldShowNotesOnThisPage ? renderNotes() : null}
                </div>
              ) : (
                <div className="flex h-full flex-col">
                  <div className="min-h-0 flex-1 px-6 pt-6 pb-4">
                    {historyEnabled ? renderHistoryBlocks(visiblePageIds) : null}
                  </div>
                  {shouldShowNotesOnThisPage ? renderNotes() : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ✅ Hide pagination completely in currentOnly mode */}
        {historyEnabled && !currentOnly ? (
          <PaginationBar page={page} total={totalPages} onChange={setPage} />
        ) : null}
      </div>
    </div>
  );
}
