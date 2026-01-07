// apps/web/components/prescription/PrescriptionPreview.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import type { RxLineType } from '@dms/types';
import { clinicDateISO } from '@/src/lib/clinicTime';

type PatientSex = 'M' | 'F' | 'O' | 'U';

type Props = {
  patientName?: string;
  patientPhone?: string;

  patientAge?: number | string;
  patientSex?: PatientSex;

  sdId?: string;
  opdNo?: string;

  // kept for compatibility, but intentionally not used anymore
  doctorName?: string;
  doctorRegdLabel?: string;

  /**
   * IMPORTANT:
   * Pass ISO day only: "Visit: YYYY-MM-DD" (preferred) or "YYYY-MM-DD"
   */
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
}: Props) {
  const hasNotes = !!receptionNotes?.trim();
  const ageSex = formatAgeSex(patientAge, patientSex);

  // ✅ clinic day key used for Regd. Date (kept)
  const visitISO = useMemo(
    () => extractIsoFromVisitLabel(visitDateLabel) ?? clinicDateISO(new Date()),
    [visitDateLabel],
  );

  /**
   * ✅ Responsive shrink-to-fit:
   * We keep a fixed "design size" sheet and scale it down to fit whatever space is available.
   * This keeps the layout identical on small cards and large cards.
   */
  const BASE_W = 760; // design width
  const BASE_H = Math.round((BASE_W * 297) / 210); // A4 aspect ratio
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
              {/* Header */}
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

                  <div className="mt-2 flex w-full items-center justify-center gap-10">
                    <div>
                      <div className="text-[10px] font-semibold tracking-[0.25em] text-emerald-600">
                        CONTACT
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-gray-900">9938942846</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold tracking-widest text-emerald-600">
                        EMERGENCY
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-gray-900">9938942846</div>
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

                <div className="mt-1 h-px w-full bg-emerald-600/60" />
              </div>

              {/* Doctor row */}
              <div className="shrink-0 px-6 pt-3">
                <div className="flex items-start justify-between gap-6">
                  {/* ✅ Left doctor (hard-coded) */}
                  <div className="min-w-0 flex flex-col">
                    <div className="text-[0.8rem] font-bold text-gray-900">
                      Dr. Soumendra Sarangi
                    </div>
                    <div className="mt-0 text-[0.7rem] font-light text-gray-700">
                      B.D.S. Regd. - 68
                    </div>
                  </div>

                  {/* ✅ Right doctor (replaces date area) */}
                  <div className="min-w-0 flex flex-col items-end text-right">
                    <div className="text-[0.8rem] font-bold text-gray-900">
                      Dr. Vaishnovee Sarangi
                    </div>
                    <div className="mt-0 text-[0.7rem] font-light text-gray-700">
                      B.D.S. Redg. - 3057
                    </div>
                  </div>
                </div>

                {/* Patient meta */}
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
                      <div className="font-semibold text-gray-900">{opdNo ?? '—'}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 h-px w-full bg-gray-900/30" />
              </div>

              {/* Lines */}
              <div className="min-h-0 flex-1 px-6 pt-4">
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
              </div>

              {/* Notes */}
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

              {/* Footer */}
              <div className="shrink-0 px-6 pb-4">
                <div className="mt-2 h-px w-full bg-emerald-600/60" />
                <div className="mt-2 text-[0.5rem] font-medium text-gray-900">
                  <div>A-33</div>
                  <div>STALWART COMPLEX</div>
                  <div>UNIT - IV</div>
                  <div>BHUBANESWAR</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
