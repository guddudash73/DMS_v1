'use client';

import { useEffect, useMemo, useState } from 'react';
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

  if (!lines.length && !reason && !visitDate && !hasToothDetails)
    return <div className="h-2 rx-block rx-block-prev" />;

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
  const showCurrentToothDetails = !historyEnabled && currentToothDetails.length > 0;

  const CONTACT_NUMBER = '9938942846';
  const ADDRESS_ONE_LINE = 'A-33, STALWART COMPLEX, UNIT - IV, BHUBANESWAR';
  const CLINIC_HOURS =
    'Clinic hours: 10 : 00 AM - 01 : 30 PM & 06 : 00 PM - 08:00 PM, Sunday Closed';

  if (!mounted) return null;

  return createPortal(
    <div className="rx-print-root">
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
            padding: 8mm;
            box-sizing: border-box;
            background: white;
          }

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

          body.print-rx.print-rx-current-only .rx-block-prev {
            visibility: hidden !important;
          }
        }
      `}</style>

      <div className="rx-a4 text-black">
        <div className="flex h-full flex-col">
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
                <div className="mt-1 text-[14px] font-semibold text-gray-900">{CONTACT_NUMBER}</div>

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
                <div className="text-[12px] font-bold text-gray-900">Dr. Soumendra Sarangi</div>
                <div className="mt-0.5 text-[11px] font-light text-gray-700">B.D.S. Regd. - 68</div>
              </div>

              <div className="flex flex-col items-end text-right">
                <div className="text-[12px] font-bold text-gray-900">Dr. Vaishnovee Sarangi</div>
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

          <div className="rx-print-medicines min-h-0 flex-1 pt-4">
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
              <div className="space-y-4">
                {chainVisitIds.map((id) => {
                  const v = visitMetaMap.get(id);

                  const isAnchor = anchorVisitId != null && id === anchorVisitId;
                  const opdInline = !isAnchor ? getVisitOpdNo(v) : undefined;

                  return (
                    <VisitRxBlock
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
            <div className="rx-print-notes shrink-0 pb-2">
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
    </div>,
    document.body,
  );
}
