'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

import { PrescriptionPreview } from '@/components/prescription/PrescriptionPreview';
import { PrescriptionPrintSheet } from '@/components/prescription/PrescriptionPrintSheet';

import type { ToothDetail, Visit } from '@dcm/types';

import {
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetVisitRxQuery,
  useGetDoctorsQuery,
  useGetPatientVisitsQuery,
} from '@/src/store/api';

type PatientSex = 'M' | 'F' | 'O' | 'U';

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

function looksLikeDoctorIdLabel(name?: string) {
  if (!name) return true;
  const s = name.trim();
  if (!s) return true;
  if (/^Doctor\s*\(.+\)$/i.test(s)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  return false;
}

function isToothDetail(v: unknown): v is ToothDetail {
  if (!isRecord(v)) return false;
  const pos = (v as any).position;
  const nums = (v as any).toothNumbers;

  const posOk = pos === 'UL' || pos === 'UR' || pos === 'LL' || pos === 'LR';
  const numsOk = Array.isArray(nums) && nums.every((n) => typeof n === 'string');
  const notesOk = (v as any).notes === undefined || typeof (v as any).notes === 'string';

  return posOk && numsOk && notesOk;
}

function toToothDetails(input: unknown): ToothDetail[] {
  if (!Array.isArray(input)) return [];
  return input.filter(isToothDetail);
}

/** ✅ NEW: patient registration date formatter (same idea as PatientDetailPage) */
function formatPatientRegdDate(patientData: unknown): string {
  // prefer numeric ms timestamps
  const createdAtNum =
    getPropNumber(patientData, 'createdAt') ??
    getPropNumber(patientData, 'created_at') ??
    getPropNumber(patientData, 'registeredAt') ??
    getPropNumber(patientData, 'regdAt');

  if (typeof createdAtNum === 'number' && Number.isFinite(createdAtNum) && createdAtNum > 0) {
    return new Date(createdAtNum).toLocaleDateString('en-GB');
  }

  // fallback: string dates
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

  // ✅ UPDATED (backend-aligned): compute from DOB if present; else fallback to stored age
  const ageFromDob = patientDob ? calculateAge(patientDob, new Date(visitCreatedAtMs)) : undefined;
  const ageStored = getNumber((patientRec as any).age);
  const patientAge = ageFromDob ?? ageStored;

  const patientSex = normalizeSex(patientSexRaw);

  // ✅ NEW: fetch/compute patient registration date (formatted)
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

  const [printWithHistory, setPrintWithHistory] = React.useState(true);

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

  // ✅ doctor notes from Rx JSON
  const doctorNotes = React.useMemo(() => {
    if (!rx || !isRecord(rx)) return '';
    return String((rx as any).doctorNotes ?? '');
  }, [rx]);

  const hasLines = (rx as any)?.lines?.length ? ((rx as any).lines.length as number) > 0 : false;
  const hasTeeth = currentToothDetails.length > 0;
  const canPrint = hasLines || hasTeeth;

  const printPrescription = () => {
    if (!canPrint) return;

    const onAfterPrint = () => {
      document.body.classList.remove('print-rx');
      document.body.classList.remove('print-rx-current-only');
      window.removeEventListener('afterprint', onAfterPrint);
    };

    window.addEventListener('afterprint', onAfterPrint);

    document.body.classList.add('print-rx');
    if (!printWithHistory) document.body.classList.add('print-rx-current-only');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  const previewCurrentOnly = !printWithHistory;

  return (
    <section className="p-4 2xl:p-8">
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

        <div className="rx-preview-shell mt-3 min-w-0 overflow-x-hidden">
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
            regdDate={patientRegdDate} // ✅ NEW
            lines={(rx as any)?.lines ?? []}
            currentVisitId={printChain.currentVisitId}
            chainVisitIds={printChain.visitIds}
            visitMetaMap={printChain.meta}
            toothDetails={currentToothDetails}
            receptionNotes={previewCurrentOnly ? undefined : ((rx as any)?.receptionNotes ?? '')}
            doctorNotes={doctorNotes}
            currentOnly={previewCurrentOnly}
          />
        </div>
      </Card>

      <PrescriptionPrintSheet
        patientName={patientName}
        patientPhone={patientPhone}
        patientAge={patientAge}
        patientSex={patientSex}
        sdId={patientSdId}
        opdNo={opdNo}
        doctorName={resolvedDoctorName}
        doctorRegdLabel={resolvedDoctorRegdLabel}
        visitDateLabel={visitCreatedDateLabel}
        regdDate={patientRegdDate} // ✅ NEW
        lines={(rx as any)?.lines ?? []}
        receptionNotes={(rx as any)?.receptionNotes ?? ''}
        doctorNotes={doctorNotes}
        currentVisitId={printChain.currentVisitId}
        chainVisitIds={printChain.visitIds}
        visitMetaMap={printChain.meta}
        printWithHistory={printWithHistory}
        toothDetails={currentToothDetails}
      />
    </section>
  );
}
