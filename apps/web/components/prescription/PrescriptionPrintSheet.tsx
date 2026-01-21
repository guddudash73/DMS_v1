'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  visitDateLabel?: string;

  lines: RxLineType[];

  currentVisitId?: string;
  chainVisitIds?: string[];
  visitMetaMap?: Map<string, Visit>;

  /** ✅ This controls history ON/OFF for printing */
  printWithHistory?: boolean;

  receptionNotes?: string;
  toothDetails?: ToothDetail[];
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
  AFTER_MEAL: 'after food',
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

function VisitRxBlock(props: {
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

  if (!lines.length && !reason && !visitDate && !hasToothDetails) {
    return <div className="h-2 rx-block rx-block-prev" />;
  }

  return (
    <div className={`rx-block ${isCurrent ? 'rx-block-current' : 'rx-block-prev'}`}>
      <div className="rx-block-meta mb-2 flex items-baseline justify-between">
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

      {lines.length ? (
        <ol className="space-y-1 text-[13px] leading-5 text-gray-900">
          {lines.map((l, idx) => (
            <li key={idx} className="flex gap-2">
              <div className="w-5 shrink-0 text-right font-medium">{idx + 1}.</div>
              <div className="font-medium">{buildLineText(l)}</div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="text-[12px] text-gray-500">No medicines recorded.</div>
      )}

      <div className="rx-block-sep mt-3 h-px w-full bg-gray-200" />
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
    visitDateLabel,
    lines,
    receptionNotes,

    currentVisitId: currentVisitIdProp,
    chainVisitIds: chainVisitIdsProp,
    visitMetaMap: visitMetaMapProp,

    toothDetails: toothDetailsProp,

    printWithHistory = true,
  } = props;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hasNotes = !!receptionNotes?.trim();
  const ageSex = formatAgeSex(patientAge, patientSex);

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
    !!visitMetaMapProp &&
    printWithHistory;

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
  const showCurrentToothDetails = !historyEnabled && currentToothDetails.length > 0;

  const CONTACT_NUMBER = '9938942846';
  const ADDRESS_ONE_LINE = 'A-33, STALWART COMPLEX, UNIT - IV, BHUBANESWAR';
  const CLINIC_HOURS =
    'Clinic hours: 10 : 00 AM - 01 : 30 PM & 06 : 00 PM - 08:00 PM, Sunday Closed';

  // ------------------------------------------------------------
  // ✅ PRINT PAGINATION (NO BLANK FIRST PAGE + NO SPLIT VISITS)
  // ------------------------------------------------------------
  const measureRootRef = useRef<HTMLDivElement | null>(null);
  const capFirstRef = useRef<HTMLDivElement | null>(null);
  const capNextRef = useRef<HTMLDivElement | null>(null);
  const notesMeasureRef = useRef<HTMLDivElement | null>(null);

  const [capFirst, setCapFirst] = useState<number>(700);
  const [capNext, setCapNext] = useState<number>(980);
  const [notesH, setNotesH] = useState<number>(0);
  const [blockHeights, setBlockHeights] = useState<number[]>([]);
  const [pages, setPages] = useState<string[][]>([chainVisitIds]);

  const shouldMeasure = historyEnabled && chainVisitIds.length > 1;

  const measureKey = useMemo(() => {
    return [
      historyEnabled ? 'H' : 'N',
      chainVisitIds.join(','),
      String(lines.length),
      String(currentToothDetails.length),
      String(receptionNotes?.length ?? 0),
    ].join('|');
  }, [historyEnabled, chainVisitIds, lines.length, currentToothDetails.length, receptionNotes]);

  useEffect(() => {
    if (!shouldMeasure) {
      setPages([chainVisitIds]);
      return;
    }

    const root = measureRootRef.current;
    if (!root) return;

    const measure = () => {
      if (capFirstRef.current) {
        const h = capFirstRef.current.getBoundingClientRect().height;
        if (Number.isFinite(h) && h > 0) setCapFirst(Math.floor(h));
      }
      if (capNextRef.current) {
        const h = capNextRef.current.getBoundingClientRect().height;
        if (Number.isFinite(h) && h > 0) setCapNext(Math.floor(h));
      }
      if (notesMeasureRef.current) {
        const h = notesMeasureRef.current.getBoundingClientRect().height;
        setNotesH(Number.isFinite(h) && h > 0 ? Math.ceil(h) : 0);
      }

      const kids = Array.from(root.querySelectorAll('[data-print-rx-block="1"]')) as HTMLElement[];
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
    if (!shouldMeasure) {
      setPages([chainVisitIds]);
      return;
    }
    if (!blockHeights.length || blockHeights.length !== chainVisitIds.length) {
      setPages([chainVisitIds]);
      return;
    }

    const SAFETY = 10;

    const heightById = (id: string) => {
      const idx = chainVisitIds.indexOf(id);
      return idx >= 0 ? (blockHeights[idx] ?? 0) : 0;
    };

    const usedOf = (arr: string[]) => arr.reduce((s, id) => s + heightById(id), 0);

    // Greedy split
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

    // Backfill gaps (pull from next page if fits)
    for (let pass = 0; pass < 3; pass++) {
      for (let p = 0; p < result.length - 1; p++) {
        const cap = p === 0 ? capFirst : capNext;

        while (result[p + 1].length > 0) {
          const nextId = result[p + 1][0];
          const h = heightById(nextId);
          const used = usedOf(result[p]);

          if (used + h <= cap - SAFETY) {
            result[p].push(nextId);
            result[p + 1].shift();
          } else {
            break;
          }
        }
      }

      result = result.filter((x) => x.length > 0);
      if (!result.length) result = [chainVisitIds];
    }

    // Notes only on last page: ensure it doesn't overflow last page
    if (hasNotes && notesH > 0 && result.length > 0) {
      const lastIdx = result.length - 1;
      const lastCap = (lastIdx === 0 ? capFirst : capNext) - notesH;

      while (result[lastIdx].length > 1 && usedOf(result[lastIdx]) > lastCap - SAFETY) {
        const moved = result[lastIdx].pop();
        if (!moved) break;
        if (result[lastIdx + 1]) result[lastIdx + 1].unshift(moved);
        else result.push([moved]);
      }
    }

    setPages(result);
  }, [shouldMeasure, chainVisitIds, blockHeights, capFirst, capNext, hasNotes, notesH]);

  // When printWithHistory is OFF: render ONLY the page containing currentVisitId,
  // but keep the SAME layout spacing (headers/other blocks hidden by visibility).
  const renderMode = useMemo(() => {
    if (printWithHistory) return { kind: 'full' as const };

    // We still need the "full" page split to keep exact position
    const allPages = shouldMeasure ? pages : [chainVisitIds];

    const pageIndex = allPages.findIndex((p) => p.includes(currentVisitId));
    const safeIndex = pageIndex >= 0 ? pageIndex : 0;

    return {
      kind: 'current-only' as const,
      pageIndex: safeIndex,
      pageIds: allPages[safeIndex] ?? chainVisitIds,
    };
  }, [printWithHistory, shouldMeasure, pages, chainVisitIds, currentVisitId]);

  const pagesToRender = useMemo(() => {
    if (renderMode.kind === 'full') return pages;
    return [renderMode.pageIds];
  }, [renderMode, pages]);

  const currentOnly = renderMode.kind === 'current-only';

  const renderVisitBlocks = (ids: string[]) => {
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
              data-print-rx-block="1"
              className={[
                'rx-print-block-wrap',
                // ✅ Ensure no splitting
                'rx-print-avoid-break',
                currentOnly && !isCur ? 'rx-print-hide-preserve' : '',
              ].join(' ')}
            >
              <VisitRxBlock
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

  if (!mounted) return null;

  // Hidden measurement DOM (screen-only) – used to compute page split.
  const measureTemplate = shouldMeasure ? (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0"
      style={{ width: 0, height: 0, overflow: 'hidden', opacity: 0 }}
    >
      <div style={{ width: '210mm' }}>
        <div ref={measureRootRef}>
          {/* First page skeleton */}
          <div className="rx-a4 rx-measure-a4">
            <div className="flex h-full flex-col">
              <div className="shrink-0 px-10 pt-6">
                <div className="h-24 w-full" />
              </div>
              <div className="mt-2 h-px w-full" />
              <div className="shrink-0 px-4 pt-3">
                <div className="h-10 w-full" />
              </div>
              <div className="shrink-0 px-4 pt-2">
                <div className="h-16 w-full" />
              </div>
              <div className="mt-3 h-px w-full" />
              <div className="min-h-0 flex-1 px-4 pt-4">
                <div ref={capFirstRef} className="h-full w-full" />
              </div>
              <div className="shrink-0 px-4 pb-2">
                <div ref={notesMeasureRef} className="w-full">
                  {hasNotes ? (
                    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="text-[11px] font-semibold text-gray-700">Reception Notes</div>
                      <div className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-gray-900">
                        {receptionNotes}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Next page skeleton */}
          <div className="rx-a4 rx-measure-a4 mt-6">
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1 px-4 pt-6">
                <div ref={capNextRef} className="h-full w-full" />
              </div>
            </div>
          </div>

          {/* Real blocks measurement (same paddings as print pages) */}
          <div className="px-4 pt-4">{renderVisitBlocks(chainVisitIds)}</div>
        </div>
      </div>
    </div>
  ) : null;

  return createPortal(
    <div className="rx-print-root">
      <style>{`
        .rx-print-root { display: none; }

        /* ✅ avoid splitting a visit block across pages (extra safety) */
        .rx-print-avoid-break {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }

        /* ✅ hide but keep space */
        .rx-print-hide-preserve {
          visibility: hidden !important;
        }

        /* measurement page sizing in screen px */
        .rx-measure-a4 {
          width: 210mm;
          height: 297mm;
          padding: 8mm;
          box-sizing: border-box;
          background: white;
          overflow: hidden;
        }

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
            padding: 8mm;
            box-sizing: border-box;
            background: white;
            overflow: hidden;
          }

          /* ✅ when current-only printing, hide headers + separators but preserve spacing */
          body.print-rx.print-rx-current-only .rx-print-header,
          body.print-rx.print-rx-current-only .rx-print-doctor,
          body.print-rx.print-rx-current-only .rx-print-patient,
          body.print-rx.print-rx-current-only .rx-print-sep-top,
          body.print-rx.print-rx-current-only .rx-print-sep-mid {
            visibility: hidden !important;
          }

          body.print-rx.print-rx-current-only .rx-print-notes {
            display: none !important;
          }

          /* ✅ hide non-current visit blocks but keep their height */
          body.print-rx.print-rx-current-only .rx-block-prev {
            visibility: hidden !important;
          }

          /* ✅ also hide wrappers that aren't current (when we apply class) */
          body.print-rx.print-rx-current-only .rx-print-hide-preserve {
            visibility: hidden !important;
          }
        }
      `}</style>

      {measureTemplate}

      {pagesToRender.map((ids, pageIdx) => {
        const isFirst = renderMode.kind === 'full' ? pageIdx === 0 : true;
        const isLast = renderMode.kind === 'full' ? pageIdx === pagesToRender.length - 1 : true;

        // Notes should print only when history ON and last page
        const showNotes = printWithHistory && hasNotes && isLast;

        return (
          <div key={`rx-a4-${pageIdx}`} className="rx-a4 text-black">
            <div className="flex h-full flex-col">
              {isFirst ? (
                <>
                  <div className="rx-print-header shrink-0 px-10">
                    <div className="flex items-start justify-between gap-4">
                      <div className="relative h-20 w-20">
                        <Image
                          src="/rx-logo-r.png"
                          alt="Rx Logo"
                          fill
                          className="object-contain"
                          priority
                          unoptimized
                        />
                      </div>

                      <div className="mt-2 flex w-full flex-col items-center justify-center text-center">
                        <div className="text-[12px] font-semibold tracking-[0.25em] text-emerald-600">
                          CONTACT
                        </div>
                        <div className="mt-1 text-[14px] font-semibold text-gray-900">
                          {CONTACT_NUMBER}
                        </div>

                        <div className="mt-1 max-w-[120mm] text-[9px] font-medium leading-4 text-gray-800">
                          {ADDRESS_ONE_LINE}
                        </div>
                        <div className="max-w-[120mm] text-[9px] font-medium leading-4 text-red-400 uppercase">
                          {CLINIC_HOURS}
                        </div>
                      </div>

                      <div className="relative h-18 w-42">
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
                  </div>

                  <div className="rx-print-sep-top mt-2 h-px w-full bg-emerald-600/60" />

                  <div className="rx-print-doctor shrink-0 px-4 pt-3">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex flex-col">
                        <div className="text-[12px] font-bold text-gray-900">
                          Dr. Soumendra Sarangi
                        </div>
                        <div className="mt-0.5 text-[11px] font-light text-gray-700">
                          B.D.S. Regd. - 68
                        </div>
                      </div>

                      <div className="flex flex-col items-end text-right">
                        <div className="text-[12px] font-bold text-gray-900">
                          Dr. Vaishnovee Sarangi
                        </div>
                        <div className="mt-0.5 text-[11px] font-light text-gray-700">
                          B.D.S. Redg. - 3057
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rx-print-patient shrink-0 px-4 pt-2">
                    <div className="mt-1 flex w-full justify-between gap-6">
                      <div className="space-y-1 text-[11px] text-gray-800">
                        <div className="flex gap-3">
                          <div className="w-28 text-gray-600">Patient Name</div>
                          <div className="text-gray-600">:</div>
                          <div className="font-semibold text-gray-900">{patientName ?? '—'}</div>
                        </div>

                        <div className="flex gap-3">
                          <div className="w-28 text-gray-600">Contact No.</div>
                          <div className="text-gray-600">:</div>
                          <div className="font-semibold text-gray-900">{patientPhone ?? '—'}</div>
                        </div>

                        <div className="flex gap-3">
                          <div className="w-28 text-gray-600">Age/Sex</div>
                          <div className="text-gray-600">:</div>
                          <div className="font-semibold text-gray-900">{ageSex}</div>
                        </div>
                      </div>

                      <div className="space-y-1 text-[11px] text-gray-800">
                        <div className="flex gap-3">
                          <div className="w-28 text-gray-600">Regd. Date</div>
                          <div className="text-gray-600">:</div>
                          <div className="font-semibold text-gray-900">
                            {visitDateLabel?.replace('Visit:', '').trim() || '—'}
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <div className="w-28 text-gray-600">SD. ID</div>
                          <div className="text-gray-600">:</div>
                          <div className="font-semibold text-gray-900">{sdId ?? '—'}</div>
                        </div>

                        <div className="flex gap-3">
                          <div className="w-28 text-gray-600">OPD. No</div>
                          <div className="text-gray-600">:</div>
                          <div className="font-semibold text-gray-900">{headerOpdNo}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rx-print-sep-mid mt-3 h-px w-full bg-gray-900/30" />
                </>
              ) : null}

              <div
                className={
                  isFirst ? 'rx-print-medicines min-h-0 flex-1 pt-4' : 'min-h-0 flex-1 pt-6'
                }
              >
                {!historyEnabled ? (
                  <div className="px-4">
                    {showCurrentToothDetails ? (
                      <div className="mb-3">
                        <ToothDetailsBlock toothDetails={currentToothDetails} />
                        <div className="mt-3 h-px w-full bg-gray-200" />
                      </div>
                    ) : null}

                    {lines.length ? (
                      <ol className="space-y-1 text-[13px] leading-5 text-gray-900">
                        {lines.map((l, idx) => (
                          <li key={idx} className="flex gap-2">
                            <div className="w-5 shrink-0 text-right font-medium">{idx + 1}.</div>
                            <div className="font-medium">{buildLineText(l)}</div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="text-[12px] text-gray-500">No medicines recorded.</div>
                    )}

                    <div className="mt-3 h-px w-full bg-gray-200" />
                  </div>
                ) : (
                  <div className="px-4">{renderVisitBlocks(ids)}</div>
                )}
              </div>

              {showNotes ? (
                <div className="rx-print-notes shrink-0 pb-2 px-4">
                  <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="text-[11px] font-semibold text-gray-700">Reception Notes</div>
                    <div className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-gray-900">
                      {receptionNotes}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
