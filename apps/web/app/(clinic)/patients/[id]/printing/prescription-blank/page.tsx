// apps/web/app/(clinic)/patients/[id]/printing/prescription-blank/page.tsx
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

import { PrescriptionPreview } from '@/components/prescription/PrescriptionPreview';

import type { PatientId, ToothDetail } from '@dcm/types';
import { useGetMeQuery, useGetPatientByIdQuery } from '@/src/store/api';

type PatientSex = 'M' | 'F' | 'O' | 'U';
type PageKind = 'ODD' | 'EVEN';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function getNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ------------------------------------------------------------------ */
/* backend-aligned: DOB preferred; fallback to stored age              */
/* ------------------------------------------------------------------ */
function safeParseDobToDate(dob: unknown): Date | null {
  if (!dob) return null;

  if (typeof dob === 'number' && Number.isFinite(dob)) {
    const d = new Date(dob);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  if (typeof dob === 'string') {
    const s = dob.trim();
    if (!s) return null;

    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const da = Number(m[3]);
      const d = new Date(y, mo, da);
      return Number.isFinite(d.getTime()) ? d : null;
    }

    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  if (dob instanceof Date) return Number.isFinite(dob.getTime()) ? dob : null;

  return null;
}

function calculateAge(dob: Date, at: Date): number {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age -= 1;
  return age < 0 ? 0 : age;
}

function normalizeSex(raw: unknown): PatientSex | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim().toUpperCase();
  if (s === 'M' || s === 'MALE') return 'M';
  if (s === 'F' || s === 'FEMALE') return 'F';
  if (s === 'O' || s === 'OTHER') return 'O';
  if (s === 'U' || s === 'UNKNOWN') return 'U';
  if (s === 'M' || s === 'F' || s === 'O' || s === 'U') return s as PatientSex;
  return undefined;
}

function getProp(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

function getPropNumber(obj: unknown, key: string): number | undefined {
  return getNumber(getProp(obj, key));
}

function getPropString(obj: unknown, key: string): string | undefined {
  return getString(getProp(obj, key));
}

function formatPatientRegdDate(patientData: unknown): string {
  const createdAtNum =
    getPropNumber(patientData, 'createdAt') ??
    getPropNumber(patientData, 'created_at') ??
    getPropNumber(patientData, 'registeredAt') ??
    getPropNumber(patientData, 'regdAt');

  if (typeof createdAtNum === 'number' && Number.isFinite(createdAtNum) && createdAtNum > 0) {
    return new Date(createdAtNum).toLocaleDateString('en-GB');
  }

  const createdAtStr =
    getPropString(patientData, 'createdAt') ??
    getPropString(patientData, 'created_at') ??
    getPropString(patientData, 'registeredAt') ??
    getPropString(patientData, 'regdAt');

  if (createdAtStr) {
    const d = new Date(createdAtStr);
    if (Number.isFinite(d.getTime())) return d.toLocaleDateString('en-GB');
  }

  return '—';
}

async function waitForFontsReady(timeoutMs = 1500) {
  try {
    const fonts = (document as any).fonts;
    if (!fonts?.ready) return;

    await Promise.race([
      fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // ignore
  }
}

async function waitForImagesReady(root: HTMLElement, timeoutMs = 2000) {
  const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
  if (!imgs.length) return;

  const tasks = imgs.map(async (img) => {
    try {
      if (img.complete && img.naturalWidth > 0) return;

      if (typeof (img as any).decode === 'function') {
        await Promise.race([
          (img as any).decode(),
          new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
        return;
      }

      await new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        setTimeout(done, timeoutMs);
      });
    } catch {
      // ignore
    }
  });

  await Promise.race([
    Promise.all(tasks).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export default function PatientBlankPrescriptionPrintPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const patientId = String(params?.id ?? '') as PatientId;

  const patientQuery = useGetPatientByIdQuery(patientId, { skip: !patientId });
  const patient = patientQuery.data ?? null;

  const patientRec: Record<string, unknown> = isRecord(patient) ? (patient as any) : {};

  const patientName = patient?.name;
  const patientPhone = patient?.phone;

  const patientSdId = getString(patientRec.sdId) ?? undefined;

  // no visit => no OPD number
  const opdNoForBlank = ''; // ✅ ensures OPD line renders blank instead of "—"

  const patientDobRaw =
    (patientRec as any).dob ??
    (patientRec as any).dateOfBirth ??
    (patientRec as any).birthDate ??
    (patientRec as any).dobIso ??
    null;

  const patientSexRaw =
    (patientRec as any).sex ?? (patientRec as any).gender ?? (patientRec as any).patientSex ?? null;

  const patientDob = safeParseDobToDate(patientDobRaw);

  // use "today" since there's no visit timestamp
  const nowMs = Date.now();
  const ageFromDob = patientDob ? calculateAge(patientDob, new Date(nowMs)) : undefined;
  const ageStored = getNumber((patientRec as any).age);
  const patientAge = ageFromDob ?? ageStored;

  const patientSex = normalizeSex(patientSexRaw);

  const patientRegdDate = React.useMemo(() => {
    return formatPatientRegdDate(patient);
  }, [patient]);

  const visitCreatedDateLabel = `Date: ${toLocalISODate(new Date(nowMs))}`;

  /**
   * ✅ Keep same Rx layout even if blank:
   * ToothDetailsBlock renders only when toothDetails.length > 0.
   */
  const toothDetailsForPreview = React.useMemo<ToothDetail[]>(() => {
    return [{} as ToothDetail];
  }, []);

  // Doctor details (optional, but keeps parity with other print pages)
  const meQuery = useGetMeQuery();
  const me = meQuery.data ?? null;

  const doctorName = me?.doctorProfile?.fullName?.trim()
    ? me.doctorProfile.fullName.trim()
    : undefined;

  const doctorRegdLabel = me?.doctorProfile?.registrationNumber
    ? `B.D.S Regd. - ${me.doctorProfile.registrationNumber}`
    : undefined;

  // ---- UI toggles (same UX as your visit blank page) ----
  const [showPrintHeader, setShowPrintHeader] = React.useState(true);
  const [activeKind, setActiveKind] = React.useState<PageKind>('ODD');

  React.useEffect(() => {
    if (activeKind === 'EVEN') setShowPrintHeader(true);
  }, [activeKind]);

  const printHeaderDisabled = activeKind !== 'ODD';
  const printHeaderDisabledTitle =
    activeKind !== 'ODD'
      ? 'Print Header applies to ODD pages only'
      : 'Toggle showing the printed prescription header/footer artwork (ODD pages only)';

  // ✅ Match PrescriptionPreview's A4 canvas (@96dpi)
  const PRINT_BASE_W = Math.round((210 / 25.4) * 96); // 794
  const PRINT_BASE_H = Math.round((297 / 25.4) * 96); // 1123

  const printBlank = () => {
    const onAfterPrint = () => {
      const el = document.querySelector<HTMLElement>('.rx-preview-print-source');
      el?.style.removeProperty('--rx-print-scale');
      document.body.classList.remove('print-preview-rx-patient-blank');
      window.removeEventListener('afterprint', onAfterPrint);
    };

    window.addEventListener('afterprint', onAfterPrint);
    document.body.classList.add('print-preview-rx-patient-blank');

    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        const host = document.querySelector<HTMLElement>('.rx-preview-print-source');
        if (host) {
          await waitForFontsReady(2000);
          await waitForImagesReady(host, 2500);

          const rect = host.getBoundingClientRect();
          const w = rect.width || 1;
          const h = rect.height || 1;

          const scale = Math.min(1, Math.min(w / PRINT_BASE_W, h / PRINT_BASE_H));
          host.style.setProperty('--rx-print-scale', String(scale));
        }

        window.print();
      });
    });
  };

  return (
    <section className="p-4 2xl:p-8">
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }

          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          body.print-preview-rx-patient-blank :not(.rx-preview-print-source):not(.rx-preview-print-source *) {
            visibility: hidden;
          }

          body.print-preview-rx-patient-blank .rx-preview-print-source {
            visibility: visible;
            position: fixed;
            inset: 0;
            margin: 0;
            padding: 0;
            background: #fff;
            overflow: hidden;
            overscroll-behavior: none;

            display: flex;
            align-items: center;
            justify-content: center;

            --rx-print-scale: 1;
          }

          body.print-preview-rx-patient-blank .rx-preview-print-source .rx-print-stage {
            width: ${PRINT_BASE_W}px;
            height: ${PRINT_BASE_H}px;
            display: inline-block;

            transform: scale(var(--rx-print-scale));
            transform-origin: center center;
          }

          body.print-preview-rx-patient-blank .rx-preview-print-source .rx-preview-shell {
            width: ${PRINT_BASE_W}px;
          }

          body.print-preview-rx-patient-blank .rx-preview-print-source .shadow-sm,
          body.print-preview-rx-patient-blank .rx-preview-print-source .shadow,
          body.print-preview-rx-patient-blank .rx-preview-print-source .rounded-xl,
          body.print-preview-rx-patient-blank .rx-preview-print-source .rounded-2xl,
          body.print-preview-rx-patient-blank .rx-preview-print-source .border {
            box-shadow: none;
            border: none;
            border-radius: 0;
          }

          body.print-preview-rx-patient-blank .rx-preview-print-source button,
          body.print-preview-rx-patient-blank .rx-preview-print-source .rx-preview-pagination,
          body.print-preview-rx-patient-blank .rx-preview-print-source [data-pagination="1"] {
            display: none;
          }

          body.print-preview-rx-patient-blank .rx-preview-shell {
            margin: 0;
            padding: 0;
          }
        }
      `}</style>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold text-gray-900">
            Prescription Print Preview (Blank)
          </div>
          <div className="text-xs text-gray-500">Patient ID: {patientId}</div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => router.back()}
          >
            Back
          </Button>

          <Button
            variant="outline"
            className="rounded-xl cursor-pointer"
            disabled={printHeaderDisabled}
            onClick={() => {
              if (printHeaderDisabled) return;
              setShowPrintHeader((v) => !v);
            }}
            title={printHeaderDisabledTitle}
          >
            {showPrintHeader ? 'Print Header: ON' : 'Print Header: OFF'}
          </Button>

          <Button
            variant="default"
            className="rounded-xl bg-black text-white hover:bg-black/90"
            onClick={printBlank}
            disabled={!patient}
            title={!patient ? 'Patient not loaded' : 'Print blank prescription'}
          >
            Print
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border bg-white p-4">
        <div className="text-sm font-semibold text-gray-900">Preview</div>

        <div className="rx-preview-print-source mt-3">
          <div className="rx-print-stage">
            <div className="rx-preview-shell min-w-0 overflow-x-hidden">
              <PrescriptionPreview
                patientName={patientName}
                patientPhone={patientPhone}
                patientAge={patientAge}
                patientSex={patientSex}
                sdId={patientSdId}
                opdNo={opdNoForBlank}
                regdDate={patientRegdDate}
                visitDateLabel={visitCreatedDateLabel}
                doctorName={doctorName}
                doctorRegdLabel={doctorRegdLabel}
                lines={[]}
                doctorNotes=""
                receptionNotes={undefined}
                toothDetails={toothDetailsForPreview}
                currentOnly={false}
                showPrintHeader={showPrintHeader}
                onActivePageKindChange={(kind) => setActiveKind(kind)}
              />
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
