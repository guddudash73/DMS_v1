'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import type { RxLineType } from '@dms/types';

type PatientSex = 'M' | 'F' | 'O' | 'U';

type Props = {
  patientName?: string;
  patientPhone?: string;

  patientAge?: number | string;
  patientSex?: PatientSex;

  sdId?: string;
  opdNo?: string;

  doctorName?: string;
  doctorRegdLabel?: string; // ✅ NEW
  visitDateLabel?: string;

  lines: RxLineType[];
  receptionNotes?: string;
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

function formatDateDDMMYYYY(d: Date) {
  return d.toLocaleDateString('en-GB'); // dd/mm/yyyy
}

function parseDateFromVisitLabel(visitDateLabel?: string): Date | null {
  if (!visitDateLabel) return null;

  const raw = visitDateLabel.replace('Visit:', '').trim();
  if (!raw) return null;

  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;

  return d;
}

export function PrescriptionPrintSheet(props: Props) {
  const {
    patientName,
    patientPhone,
    patientAge,
    patientSex,
    sdId,
    opdNo,
    doctorName,
    doctorRegdLabel,
    visitDateLabel,
    lines,
    receptionNotes,
  } = props;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hasNotes = !!receptionNotes?.trim();
  const ageSex = formatAgeSex(patientAge, patientSex);

  const rxDate = formatDateDDMMYYYY(parseDateFromVisitLabel(visitDateLabel) ?? new Date());

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
        }
      `}</style>

      <div className="rx-a4 text-black">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="shrink-0 px-10">
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

              <div className="mt-2 flex w-full items-center justify-center gap-10">
                <div>
                  <div className="text-[12px] font-semibold tracking-[0.25em] text-emerald-600">
                    CONTACT
                  </div>
                  <div className="mt-1 text-[14px] font-semibold text-gray-900">9938942846</div>
                </div>
                <div>
                  <div className="text-[12px] font-semibold tracking-widest text-emerald-600">
                    EMERGENCY
                  </div>
                  <div className="mt-1 text-[14px] font-semibold text-gray-900">9938942846</div>
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

          <div className="mt-2 h-px w-full bg-emerald-600/60" />

          {/* Doctor row + Date */}
          <div className="shrink-0 pt-3 px-4">
            <div className="flex items-start justify-between gap-6">
              <div className="flex flex-col">
                {/* ✅ no hardcode, show '—' while loading */}
                <div className="text-[12px] font-bold text-gray-900">
                  {doctorName?.trim() ? doctorName : '—'}
                </div>

                {/* ✅ dynamic regd label */}
                <div className="mt-0.5 text-[11px] font-semibold text-gray-700">
                  {doctorRegdLabel?.trim() ? doctorRegdLabel : '—'}
                </div>
              </div>

              <div className="flex flex-col items-end text-[11px]">
                <div className="text-gray-600">Date</div>
                <div className="font-semibold text-gray-900">{rxDate}</div>
              </div>
            </div>

            <div className="mt-3 flex w-full justify-between gap-6">
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
                  <div className="font-semibold text-gray-900">{opdNo ?? '—'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 h-px w-full bg-gray-900/30" />

          {/* Medicines */}
          <div className="min-h-0 flex-1 pt-4">
            {lines.length === 0 ? (
              // ✅ Blank area for "blank Rx" print (no placeholder text)
              <div className="h-full" />
            ) : (
              <ol className="space-y-2 text-[14px] leading-6 text-gray-900">
                {lines.map((l, idx) => (
                  <li key={idx} className="flex gap-3">
                    <div className="w-6 shrink-0 text-right font-medium">{idx + 1}.</div>
                    <div className="font-medium">{buildLineText(l)}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Notes */}
          {hasNotes ? (
            <div className="shrink-0 pb-2">
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-[11px] font-semibold text-gray-700">Reception Notes</div>
                <div className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-gray-900">
                  {receptionNotes}
                </div>
              </div>
            </div>
          ) : null}

          {/* Footer */}
          <div className="shrink-0 pb-2">
            <div className="mt-6 h-px w-full bg-emerald-600/60" />
            <div className="mt-2 text-[10px] font-medium text-gray-900">
              <div>A-33</div>
              <div>STALWART COMPLEX</div>
              <div>UNIT - IV</div>
              <div>BHUBANESWAR</div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
