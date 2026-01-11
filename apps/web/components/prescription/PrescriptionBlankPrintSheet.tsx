'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

type PatientSex = 'M' | 'F' | 'O' | 'U';

type Props = {
  patientName?: string;
  patientPhone?: string;
  patientAge?: number | string;
  patientSex?: PatientSex;
  sdId?: string;
  opdNo?: string;
  visitDateLabel?: string; // expects something like "Visit: YYYY-MM-DD" (same as your current pages)
};

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

function BlankPrescriptionSheetContent({
  patientName,
  patientPhone,
  patientAge,
  patientSex,
  sdId,
  opdNo,
  visitDateLabel,
}: Props) {
  const ageSex = formatAgeSex(patientAge, patientSex);

  // ✅ Header micro-text (same as your current print sheet)
  const CONTACT_NUMBER = '9938942846';
  const ADDRESS_ONE_LINE = 'A-33, STALWART COMPLEX, UNIT - IV, BHUBANESWAR';
  const CLINIC_HOURS =
    'Clinic hours: 10 : 00 AM - 01 : 30 PM & 06 : 00 PM - 08:00 PM, Sunday Closed';

  return (
    <div className="rx-a4 text-black">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="rx-print-header shrink-0 px-10">
          <div className="flex items-start justify-between gap-4">
            {/* Left Logo */}
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

            {/* Center */}
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

            {/* Right Logo */}
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

        {/* Doctor row (static, same as your current template) */}
        <div className="rx-print-doctor shrink-0 px-4 pt-3">
          <div className="flex items-start justify-between gap-6">
            <div className="flex flex-col">
              <div className="text-[12px] font-bold text-gray-900">Dr. Soumendra Sarangi</div>
              <div className="mt-0.5 text-[11px] font-light text-gray-700">B.D.S. Regd. - 68</div>
            </div>

            <div className="flex flex-col items-end text-right">
              <div className="text-[12px] font-bold text-gray-900">Dr. Vaishnovee Sarangi</div>
              <div className="mt-0.5 text-[11px] font-light text-gray-700">B.D.S. Redg. - 3057</div>
            </div>
          </div>
        </div>

        {/* Patient meta */}
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
                <div className="font-semibold text-gray-900">{opdNo ?? '—'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rx-print-sep-mid mt-3 h-px w-full bg-gray-900/30" />

        {/* ✅ Blank body area (NO "No medicines recorded.") */}
        <div className="min-h-0 flex-1 px-4 pt-4">
          <div className="h-full w-full rounded-2xl border-gray-200 bg-white" />
        </div>
      </div>
    </div>
  );
}

export function PrescriptionBlankPrintSheet(props: Props) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div className="rx-blank-print-root">
      <style>{`
        .rx-blank-print-root { display: none; }

        @media print {
          body.print-rx-blank > *:not(.rx-blank-print-root) { display: none !important; }
          body.print-rx-blank .rx-blank-print-root { display: block !important; }

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

      <BlankPrescriptionSheetContent {...props} />
    </div>,
    document.body,
  );
}

export function PrescriptionBlankPreview(props: Props) {
  // Preview uses the same content block (no portal)
  return (
    <div className="w-full overflow-x-auto">
      <div className="mx-auto w-[210mm] max-w-full rounded-2xl border bg-white p-4">
        <BlankPrescriptionSheetContent {...props} />
      </div>
    </div>
  );
}
