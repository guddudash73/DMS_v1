'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
    <div className={`rx-prev-block ${isCurrent ? 'rx-prev-block-current' : 'rx-prev-block-prev'}`}>
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

    if (currentVisitId && !ids.includes(currentVisitId)) {
      ids.push(currentVisitId);
    }

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

  return (
    <div ref={wrapRef} className="w-full">
      <div
        className="relative w-full"
        style={{
          height: Math.ceil(BASE_H * scale),
        }}
      >
        <div
          className="origin-top-left"
          style={{
            width: BASE_W,
            height: BASE_H,
            transform: `scale(${scale})`,
          }}
        >
          <div className="h-full w-full overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="flex h-full flex-col">
              <div className="shrink-0 px-6 pt-4">
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
                    <div className="text-[12px] font-semibold text-gray-900">{CONTACT_NUMBER}</div>

                    <div className="mt-1 max-w-[520px] text-[9px] font-medium leading-4  text-gray-700">
                      {ADDRESS_ONE_LINE}
                    </div>
                    <div className="max-w-[520px] text-[9px] font-medium leading-4 text-red-400 uppercase">
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

              <div className="shrink-0 px-6 pt-3">
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

              <div className="min-h-0 flex-1 px-6 pt-4">
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
                            <div className="w-4 shrink-0 text-right font-medium">{idx + 1}.</div>
                            <div className="font-medium">{buildLineText(l)}</div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    {chainVisitIds.map((id) => {
                      const v = visitMetaMap.get(id);

                      const isAnchor = anchorVisitId != null && id === anchorVisitId;
                      const opdInline = !isAnchor ? getVisitOpdNo(v) : undefined;

                      return (
                        <VisitRxPreviewBlock
                          key={id}
                          visitId={id === 'CURRENT' ? '' : id}
                          isCurrent={id === currentVisitId}
                          currentLines={lines}
                          visit={v}
                          showOpdInline={!isAnchor}
                          opdInlineText={opdInline}
                          currentToothDetails={currentToothDetails}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {hasNotes ? (
                <div className="shrink-0 px-6 pb-2">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="text-[10px] font-semibold text-gray-700">Reception Notes</div>
                    <div className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-gray-900">
                      {receptionNotes}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
