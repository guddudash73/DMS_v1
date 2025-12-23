'use client';

import Image from 'next/image';
import type { RxLineType } from '@dms/types';

type Props = {
  patientName?: string;
  patientPhone?: string;
  doctorName?: string;
  visitDateLabel?: string; // we'll show this as "Regd. Date"
  lines: RxLineType[];
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

  // Frequency like: QD(Once Daily)
  const freq = l.frequency ? `${l.frequency}(${FREQ_LABEL[l.frequency]})` : '';
  const timing = l.timing ? TIMING_LABEL[l.timing] : '';

  // Compose: "QD(Once Daily) After food"
  const freqTiming = [freq, timing].filter(Boolean).join(' ').trim();

  if (freqTiming) parts.push(`- ${freqTiming}`);

  // Duration: "For 3 days."
  if (typeof l.duration === 'number' && l.duration > 0) {
    parts.push(`For ${l.duration} days.`);
  }

  // Notes (optional)
  if (l.notes?.trim()) parts.push(l.notes.trim());

  return parts.join(' ');
}

export function PrescriptionPreview({
  patientName,
  patientPhone,
  doctorName,
  visitDateLabel,
  lines,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-[760px]">
      {/* A4 sheet */}
      <div className="aspect-210/297 w-full overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex h-full flex-col">
          {/* ===== Fixed Header ===== */}
          <div className="shrink-0 px-6 pt-4">
            <div className="flex items-start gap-4 justify-between">
              {/* Left: tooth logo */}
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

              {/* Center: CONTACT / EMERGENCY */}
              <div className="mt-2 flex items-center justify-center w-full gap-10">
                <div>
                  <div className="text-[10px] 2xl:text-[14px] font-semibold tracking-[0.25em] text-emerald-600">
                    CONTACT
                  </div>
                  <div className="mt-1 text-[11px] 2xl:text-[16px] font-semibold text-gray-900">
                    9938942846
                  </div>
                </div>
                <div>
                  <div className="text-[10px] 2xl:text-[14px] font-semibold tracking-widest text-emerald-600">
                    EMERGENCY
                  </div>
                  <div className="mt-1 text-[11px] 2xl:text-[16px] font-semibold text-gray-900 ">
                    9938942846
                  </div>
                </div>
              </div>

              {/* Right: Sarangi Dentistry logo */}
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

            {/* green divider */}
            <div className="mt-1 h-px w-full bg-emerald-600/60" />
          </div>

          {/* ===== Fixed Patient/Doctor Block ===== */}
          <div className="shrink-0 px-6 pt-3">
            <div className="flex flex-col items-start justify-between">
              {/* Left column */}
              <div className="min-w-[360px] flex flex-col">
                <div className="2xl:text-xs text-[0.6rem] font-bold text-gray-900">
                  {doctorName ?? 'Dr. Soumendra Sarangi'}
                </div>
                <div className="2xl:mt-1 mt-0 2xl:text-[12px] text-[0.5rem] font-semibold text-gray-700">
                  B.D.S Regd. - 68
                </div>
              </div>
              <div className="flex 2xl:mt-3 mt-2 w-full justify-between">
                <div className="2xl:space-y-1 space-y-0 2xl:text-[0.7rem] text-[0.5rem] text-gray-800">
                  <div className="flex gap-3">
                    <div className="2xl:w-18 w-12 text-gray-600">Patient Name</div>
                    <div className="text-gray-600">:</div>
                    <div className="font-semibold text-gray-900">{patientName ?? '—'}</div>
                  </div>
                  <div className="flex gap-3">
                    <div className="2xl:w-18 w-12 text-gray-600">AGE / SEX</div>
                    <div className="text-gray-600">:</div>
                    <div className="font-semibold text-gray-900">—</div>
                  </div>
                  <div className="flex gap-3">
                    <div className="2xl:w-18 w-12 text-gray-600">Contact No.</div>
                    <div className="text-gray-600">:</div>
                    <div className="font-semibold text-gray-900">{patientPhone ?? '—'}</div>
                  </div>
                </div>

                {/* Right column */}
                <div className="2xl:space-y-1 space-y-0 2xl:text-[0.7rem] text-[0.5rem] 2xl:w-50 w-40 justify-start">
                  <div className="flex gap-3 ">
                    <div className="2xl:w-18 w-12 text-gray-600">Regd. Date</div>
                    <div className="text-gray-600">:</div>
                    <div className="font-semibold text-gray-900">
                      {visitDateLabel?.replace('Visit:', '').trim() || '—'}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="2xl:w-18 w-12 text-gray-600">SD. ID</div>
                    <div className="text-gray-600">:</div>
                    <div className="font-semibold text-gray-900">—</div>
                  </div>
                  <div className="flex gap-3">
                    <div className="2xl:w-18 w-12 text-gray-600">OPD. No</div>
                    <div className="text-gray-600">:</div>
                    <div className="font-semibold text-gray-900">—</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 h-px w-full bg-gray-900/30" />
          </div>

          {/* ===== Scroll/Expand Area (ONLY medicines content changes) ===== */}
          <div className="min-h-0 flex-1 px-6 pt-4">
            {lines.length === 0 ? (
              <div className="text-[13px] text-gray-500">No medicines added yet.</div>
            ) : (
              <ol className="space-y-6 text-[16px] leading-7 text-gray-900">
                {lines.map((l, idx) => (
                  <li key={idx} className="flex gap-3">
                    <div className="w-6 shrink-0 text-right font-medium">{idx + 1}.</div>
                    <div className="font-medium">{buildLineText(l)}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* ===== Fixed Footer ===== */}
          <div className="shrink-0 px-6 pb-4">
            <div className="mt-2 h-px w-full bg-emerald-600/60" />
            <div className="mt-2 2xl:text-xs text-[0.5rem] font-medium text-gray-900">
              <div>A-33</div>
              <div>STALWART COMPLEX</div>
              <div>UNIT - IV</div>
              <div>BHUBANESWAR</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
