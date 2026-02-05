// apps/web/app/(clinic)/visits/[visitId]/checkout/printing/prescription/page.tsx
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

import { PrescriptionPreview } from '@/components/prescription/PrescriptionPreview';

import type { ToothDetail, Visit } from '@dcm/types';

import {
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetVisitRxQuery,
  useGetDoctorsQuery,
  useGetPatientVisitsQuery,
} from '@/src/store/api';

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

function getProp(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

function getPropString(obj: unknown, key: string): string | undefined {
  return getString(getProp(obj, key));
}

function getPropNumber(obj: unknown, key: string): number | undefined {
  return getNumber(getProp(obj, key));
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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

function looksLikeDoctorIdLabel(name?: string) {
  if (!name) return true;
  const s = name.trim();
  if (!s) return true;
  if (/^Doctor\s*\(.+\)$/i.test(s)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  return false;
}

/**
 * ✅ Updated for new backend rules:
 * - position is optional
 * - toothNumbers is optional
 * - allow notes/diagnosis/advice/procedure only blocks (no tooth numbers)
 */
function isToothDetail(v: unknown): v is ToothDetail {
  if (!isRecord(v)) return false;

  const pos = (v as any).position;
  const nums = (v as any).toothNumbers;

  const posOk =
    pos === undefined ||
    pos === null ||
    pos === '' ||
    pos === 'UL' ||
    pos === 'UR' ||
    pos === 'LL' ||
    pos === 'LR';

  const numsOk =
    nums === undefined ||
    nums === null ||
    (Array.isArray(nums) && nums.every((n) => typeof n === 'string'));

  const notesOk = (v as any).notes === undefined || typeof (v as any).notes === 'string';
  const dxOk = (v as any).diagnosis === undefined || typeof (v as any).diagnosis === 'string';
  const adviceOk = (v as any).advice === undefined || typeof (v as any).advice === 'string';
  const procOk = (v as any).procedure === undefined || typeof (v as any).procedure === 'string';
  const blockOk = (v as any).blockId === undefined || typeof (v as any).blockId === 'string';

  if (!posOk || !numsOk || !notesOk || !dxOk || !adviceOk || !procOk || !blockOk) return false;

  const hasAnyValue =
    (typeof pos === 'string' && pos.trim()) ||
    (Array.isArray(nums) && nums.length > 0) ||
    (typeof (v as any).notes === 'string' && (v as any).notes.trim()) ||
    (typeof (v as any).diagnosis === 'string' && (v as any).diagnosis.trim()) ||
    (typeof (v as any).advice === 'string' && (v as any).advice.trim()) ||
    (typeof (v as any).procedure === 'string' && (v as any).procedure.trim()) ||
    (typeof (v as any).blockId === 'string' && (v as any).blockId.trim());

  return Boolean(hasAnyValue);
}

function toToothDetails(input: unknown): ToothDetail[] {
  if (!Array.isArray(input)) return [];

  return input.filter(isToothDetail).map((raw: any) => {
    const next: any = { ...raw };

    if (Array.isArray(next.toothNumbers)) {
      const cleaned = next.toothNumbers
        .map(String)
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (cleaned.length) next.toothNumbers = cleaned;
      else delete next.toothNumbers;
    }

    for (const k of ['notes', 'diagnosis', 'advice', 'procedure', 'blockId', 'position'] as const) {
      if (typeof next[k] === 'string') {
        const t = next[k].trim();
        if (t) next[k] = t;
        else delete next[k];
      } else if (next[k] == null) {
        delete next[k];
      }
    }

    return next as ToothDetail;
  });
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

export default function PrescriptionPrintPreviewPage() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();

  const visitId = String(params?.visitId ?? '');

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const visit = visitQuery.data as unknown;

  const visitRec: Record<string, unknown> = isRecord(visit) ? visit : {};
  const patientId = getString(visitRec.patientId);

  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !patientId });

  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: !visitId });
  const rx = rxQuery.data?.rx ?? null;

  const doctorsQuery = useGetDoctorsQuery(undefined);

  const visitsQuery = useGetPatientVisitsQuery(patientId ?? '', { skip: !patientId });
  const allVisitsRaw = (visitsQuery.data?.items ?? []) as Visit[];

  const patientName = patientQuery.data?.name;
  const patientPhone = patientQuery.data?.phone;

  const patientRec: Record<string, unknown> = isRecord(patientQuery.data) ? patientQuery.data : {};

  const patientSdId = getString(patientRec.sdId) ?? getString(visitRec.sdId) ?? undefined;

  const opdNo =
    getString(visitRec.opdNo) ??
    getString(visitRec.opdId) ??
    getString(visitRec.opdNumber) ??
    undefined;

  const patientDobRaw =
    (patientRec as any).dob ??
    (patientRec as any).dateOfBirth ??
    (patientRec as any).birthDate ??
    (patientRec as any).dobIso ??
    null;

  const patientSexRaw =
    (patientRec as any).sex ?? (patientRec as any).gender ?? (patientRec as any).patientSex ?? null;

  const patientDob = safeParseDobToDate(patientDobRaw);

  const visitCreatedAtMs = getNumber(visitRec.createdAt) ?? Date.now();

  const ageFromDob = patientDob ? calculateAge(patientDob, new Date(visitCreatedAtMs)) : undefined;
  const ageStored = getNumber((patientRec as any).age);
  const patientAge = ageFromDob ?? ageStored;

  const patientSex = normalizeSex(patientSexRaw);

  const patientRegdDate = React.useMemo(() => {
    return formatPatientRegdDate(patientQuery.data);
  }, [patientQuery.data]);

  const doctorId = getString(visitRec.doctorId);

  const doctorFromList = React.useMemo(() => {
    const listUnknown = doctorsQuery.data ?? [];
    if (!doctorId) return null;

    const list = Array.isArray(listUnknown) ? (listUnknown as unknown[]) : [];
    return (
      list.find(
        (d) => isRecord(d) && getString((d as Record<string, unknown>).doctorId) === doctorId,
      ) ?? null
    );
  }, [doctorsQuery.data, doctorId]);

  const doctorRec: Record<string, unknown> = isRecord(doctorFromList) ? doctorFromList : {};

  const doctorNameResolved =
    getString((doctorRec as any).fullName) ??
    getString((doctorRec as any).name) ??
    getString((doctorRec as any).displayName) ??
    undefined;

  const doctorRegNoResolved = getString((doctorRec as any).registrationNumber) ?? undefined;

  const resolvedDoctorName = React.useMemo(() => {
    if (doctorNameResolved && !looksLikeDoctorIdLabel(doctorNameResolved))
      return doctorNameResolved;
    if (doctorsQuery.isLoading || doctorsQuery.isFetching) return undefined;
    return doctorId ? `Doctor (${doctorId})` : undefined;
  }, [doctorNameResolved, doctorsQuery.isLoading, doctorsQuery.isFetching, doctorId]);

  const resolvedDoctorRegdLabel = React.useMemo(() => {
    if (doctorRegNoResolved) return `B.D.S Regd. - ${doctorRegNoResolved}`;
    if (doctorsQuery.isLoading || doctorsQuery.isFetching) return undefined;
    return undefined;
  }, [doctorRegNoResolved, doctorsQuery.isLoading, doctorsQuery.isFetching]);

  const visitCreatedDateLabel = visitCreatedAtMs
    ? `Visit: ${toLocalISODate(new Date(visitCreatedAtMs))}`
    : undefined;

  // ---- UI toggles ----
  const [printWithHistory, setPrintWithHistory] = React.useState(true);

  // true => show header/footer artwork; false => hide them but keep space reserved
  const [showPrintHeader, setShowPrintHeader] = React.useState(true);

  // track which page is currently being previewed (ODD/EVEN)
  const [activeKind, setActiveKind] = React.useState<PageKind>('ODD');

  const previewCurrentOnly = !printWithHistory;

  React.useEffect(() => {
    if (activeKind === 'EVEN') setShowPrintHeader(true);
  }, [activeKind]);

  const printChain = React.useMemo(() => {
    const meta = new Map<string, Visit>();

    for (const v of allVisitsRaw) meta.set(v.visitId, v);
    const visitIdFromData = isRecord(visit) ? getString(visitRec.visitId) : undefined;
    if (visitIdFromData) meta.set(visitIdFromData, visit as Visit);

    const tag = isRecord(visit) ? getString(visitRec.tag) : undefined;
    const anchorVisitId = isRecord(visit) ? getString(visitRec.anchorVisitId) : undefined;

    const anchorId = tag === 'F' ? anchorVisitId : visitId;
    if (!anchorId) return { visitIds: [visitId], meta, currentVisitId: visitId };

    const anchor = meta.get(anchorId);
    const chain: Visit[] = [];
    if (anchor) chain.push(anchor);

    const followups: Visit[] = [];
    for (const v of meta.values()) {
      const aId = getString((v as unknown as Record<string, unknown>)?.anchorVisitId);
      if (aId && aId === anchorId && v.visitId !== anchorId) followups.push(v);
    }

    followups.sort((a, b) => (a.createdAt ?? a.updatedAt ?? 0) - (b.createdAt ?? b.updatedAt ?? 0));
    chain.push(...followups);

    if (!chain.some((v) => v.visitId === visitId)) {
      const cur = meta.get(visitId);
      chain.push(cur ?? ({ visitId } as Visit));
    }

    chain.sort((a, b) => (a.createdAt ?? a.updatedAt ?? 0) - (b.createdAt ?? b.updatedAt ?? 0));

    const seen = new Set<string>();
    const chainIdsOrdered = chain
      .map((v) => v.visitId)
      .filter((id) => {
        if (!id) return false;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

    const idx = chainIdsOrdered.indexOf(visitId);
    const limitedIds = idx >= 0 ? chainIdsOrdered.slice(0, idx + 1) : [visitId];

    return { visitIds: limitedIds, meta, currentVisitId: visitId };
  }, [allVisitsRaw, visit, visitId, visitRec]);

  const currentToothDetails = React.useMemo(() => {
    const rec: Record<string, unknown> = isRecord(rx)
      ? (rx as unknown as Record<string, unknown>)
      : {};
    return toToothDetails((rec as any).toothDetails);
  }, [rx]);

  /**
   * ✅ Force Tooth Details block to render even when no entries exist:
   * PrescriptionPreview likely checks toothDetails.length > 0.
   * Passing one empty object will show the block but with blank content.
   */
  const toothDetailsForPreview = React.useMemo<ToothDetail[]>(() => {
    return currentToothDetails.length > 0
      ? currentToothDetails
      : ([{} as ToothDetail] as ToothDetail[]);
  }, [currentToothDetails]);

  const doctorNotes = React.useMemo(() => {
    if (!rx || !isRecord(rx)) return '';
    return String((rx as any).doctorNotes ?? '');
  }, [rx]);

  const hasLines = (rx as any)?.lines?.length ? ((rx as any).lines.length as number) > 0 : false;

  // ✅ allow printing even if only notes/diagnosis exist (even without teeth numbers)
  const hasTeeth = currentToothDetails.length > 0 || toothDetailsForPreview.length > 0; // will be true due to placeholder
  const canPrint = hasLines || hasTeeth;

  // ✅ Match PrescriptionPreview's A4 canvas (@96dpi)
  const PRINT_BASE_W = Math.round((210 / 25.4) * 96); // 794
  const PRINT_BASE_H = Math.round((297 / 25.4) * 96); // 1123

  const printPrescription = () => {
    if (!canPrint) return;

    const onAfterPrint = () => {
      const el = document.querySelector<HTMLElement>('.rx-preview-print-source');
      el?.style.removeProperty('--rx-print-scale');
      document.body.classList.remove('print-preview-rx');
      window.removeEventListener('afterprint', onAfterPrint);
    };

    window.addEventListener('afterprint', onAfterPrint);
    document.body.classList.add('print-preview-rx');

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

  /**
   * ✅ UX change:
   * Don't hide "Print Header" when Print: Current only is ON.
   * Keep it visible but DISABLED (muted).
   *
   * Also disable on EVEN pages (header doesn't apply there).
   */
  const printHeaderDisabled = !canPrint || previewCurrentOnly || activeKind !== 'ODD';

  const printHeaderDisabledTitle = !canPrint
    ? 'Nothing to print'
    : previewCurrentOnly
      ? 'Print Header is only available when History is ON'
      : activeKind !== 'ODD'
        ? 'Print Header applies to ODD pages only'
        : 'Toggle showing the printed prescription header/footer artwork (ODD pages only)';

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

          body.print-preview-rx :not(.rx-preview-print-source):not(.rx-preview-print-source *) {
            visibility: hidden;
          }

          body.print-preview-rx .rx-preview-print-source {
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

          body.print-preview-rx .rx-preview-print-source .rx-print-stage {
            width: ${PRINT_BASE_W}px;
            height: ${PRINT_BASE_H}px;
            display: inline-block;

            transform: scale(var(--rx-print-scale));
            transform-origin: center center;
          }

          body.print-preview-rx .rx-preview-print-source .rx-preview-shell {
            width: ${PRINT_BASE_W}px;
          }

          body.print-preview-rx .rx-preview-print-source .shadow-sm,
          body.print-preview-rx .rx-preview-print-source .shadow,
          body.print-preview-rx .rx-preview-print-source .rounded-xl,
          body.print-preview-rx .rx-preview-print-source .rounded-2xl,
          body.print-preview-rx .rx-preview-print-source .border {
            box-shadow: none;
            border: none;
            border-radius: 0;
          }

          body.print-preview-rx .rx-preview-print-source button,
          body.print-preview-rx .rx-preview-print-source .rx-preview-pagination,
          body.print-preview-rx .rx-preview-print-source [data-pagination="1"] {
            display: none;
          }

          body.print-preview-rx .rx-preview-shell {
            margin: 0;
            padding: 0;
          }
        }
      `}</style>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold text-gray-900">Prescription Print Preview</div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl cursor-pointer"
            onClick={() => router.back()}
          >
            Back
          </Button>

          <Button
            variant="outline"
            className="rounded-xl cursor-pointer"
            disabled={!canPrint}
            onClick={() => setPrintWithHistory((v) => !v)}
            title="Toggle printing previous visit blocks"
          >
            {printWithHistory ? 'Print: History ON' : 'Print: Current only'}
          </Button>

          {/* ✅ Always visible now; muted via disabled */}
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
            className="rounded-xl bg-black text-white hover:bg-black/90 cursor-pointer"
            onClick={printPrescription}
            disabled={!canPrint}
            title={!canPrint ? 'No medicines or tooth details to print' : 'Print prescription'}
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
                opdNo={opdNo}
                doctorName={resolvedDoctorName}
                doctorRegdLabel={resolvedDoctorRegdLabel}
                visitDateLabel={visitCreatedDateLabel}
                regdDate={patientRegdDate}
                lines={(rx as any)?.lines ?? []}
                currentVisitId={printChain.currentVisitId}
                chainVisitIds={printChain.visitIds}
                visitMetaMap={printChain.meta}
                toothDetails={toothDetailsForPreview}
                receptionNotes={
                  previewCurrentOnly ? undefined : ((rx as any)?.receptionNotes ?? '')
                }
                doctorNotes={doctorNotes}
                currentOnly={previewCurrentOnly}
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
