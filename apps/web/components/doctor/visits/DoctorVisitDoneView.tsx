'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import type { Visit } from '@dcm/types';

import { useGetVisitRxQuery, useGetPatientVisitsQuery } from '@/src/store/api';

import { ClipboardList, Image as ImageIcon } from 'lucide-react';
import type { VisitPrescriptionQuickLookDialogProps } from './dialogs/VisitPrescriptionQuickLookDialog';

const PrescriptionPreview = dynamic(
  () => import('@/components/prescription/PrescriptionPreview').then((m) => m.PrescriptionPreview),
  { ssr: false },
);

const XrayTrayReadOnly = dynamic(
  () => import('@/components/xray/XrayTrayReadOnly').then((m) => m.XrayTrayReadOnly),
  { ssr: false },
);

const DoctorVisitHistoryPanel = dynamic(
  () => import('./DoctorVisitHistoryPanel').then((m) => m.DoctorVisitHistoryPanel),
  {
    ssr: false,
    loading: () => (
      <Card className="mt-4 w-full rounded-2xl border bg-white p-4">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-100" />
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-gray-50" />
      </Card>
    ),
  },
);

const VisitPrescriptionQuickLookDialog = dynamic<VisitPrescriptionQuickLookDialogProps>(
  () =>
    import('./dialogs/VisitPrescriptionQuickLookDialog').then(
      (m) => m.VisitPrescriptionQuickLookDialog,
    ),
  { ssr: false },
);

const VisitXrayQuickLookDialog = dynamic(
  () => import('./dialogs/VisitXrayQuickLookDialog').then((m) => m.VisitXrayQuickLookDialog),
  { ssr: false },
);

/* ------------------------------------------------------------------ */
/* utils */
/* ------------------------------------------------------------------ */

type UnknownRecord = Record<string, unknown>;
function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}
function getProp(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}
function getString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}
function getNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function getPropString(obj: unknown, key: string): string | undefined {
  return getString(getProp(obj, key));
}
function getPropNumber(obj: unknown, key: string): number | undefined {
  return getNumber(getProp(obj, key));
}

function anchorIdFromVisit(v: Visit): string | undefined {
  return getPropString(v as unknown, 'anchorVisitId') ?? getPropString(v as unknown, 'anchorId');
}

/** ✅ NEW: format patient registration date (same logic style as PatientDetailPage) */
function formatPatientRegdDate(patient: unknown): string {
  // prefer ms timestamps
  const createdAtNum =
    getPropNumber(patient, 'createdAt') ??
    getPropNumber(patient, 'created_at') ??
    getPropNumber(patient, 'registeredAt') ??
    getPropNumber(patient, 'regdAt');

  if (typeof createdAtNum === 'number' && Number.isFinite(createdAtNum) && createdAtNum > 0) {
    return new Date(createdAtNum).toLocaleDateString('en-GB');
  }

  // fallback: string
  const createdAtStr =
    getPropString(patient, 'createdAt') ??
    getPropString(patient, 'created_at') ??
    getPropString(patient, 'registeredAt') ??
    getPropString(patient, 'regdAt');

  if (createdAtStr) {
    const d = new Date(createdAtStr);
    if (Number.isFinite(d.getTime())) return d.toLocaleDateString('en-GB');
  }

  return '—';
}

/* ------------------------------------------------------------------ */
/* patient helpers (backend-aligned) */
/* ------------------------------------------------------------------ */

function safeParseDobToDate(dob: unknown): Date | null {
  if (typeof dob !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  return Number.isFinite(date.getTime()) ? date : null;
}

function calculateAge(dob: Date, at: Date): number {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age -= 1;
  return age < 0 ? 0 : age;
}

type PatientSex = 'M' | 'F' | 'O' | 'U';
function normalizeSex(raw: unknown): PatientSex | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim().toUpperCase();
  if (s === 'MALE' || s === 'M') return 'M';
  if (s === 'FEMALE' || s === 'F') return 'F';
  if (s === 'OTHER' || s === 'O') return 'O';
  if (s === 'UNKNOWN' || s === 'U') return 'U';
  return undefined;
}

/* ------------------------------------------------------------------ */
/* component */
/* ------------------------------------------------------------------ */

export function DoctorVisitDoneView(props: {
  visitId: string;
  patientId: string;
  patient: unknown;
  visit: Visit;
  doctorName?: string;
  doctorRegdLabel?: string;
  visitDate?: string;
  visitDateLabel?: string;
  opdNo?: string;
  rxLatest: unknown;
}) {
  const router = useRouter();
  const {
    visitId,
    patientId,
    patient,
    visit,
    doctorName,
    doctorRegdLabel,
    visitDate,
    visitDateLabel,
    opdNo,
    rxLatest,
  } = props;

  /* ---------------- history toggle ---------------- */

  const [showHistory, setShowHistory] = React.useState(false);

  const visitsQuery = useGetPatientVisitsQuery(patientId ?? '', {
    skip: !patientId || !showHistory,
    refetchOnMountOrArgChange: true,
  });

  const allVisitsRaw = React.useMemo(() => {
    if (!showHistory) return [];
    const items = getProp(visitsQuery.data, 'items');
    return Array.isArray(items) ? (items as Visit[]) : [];
  }, [visitsQuery.data, showHistory]);

  /* ---------------- rx ---------------- */

  const rxQuery = useGetVisitRxQuery({ visitId });
  const rxToShow = rxQuery.data?.rx ?? (isRecord(rxLatest) ? rxLatest : null);

  const lines = Array.isArray(getProp(rxToShow, 'lines'))
    ? (getProp(rxToShow, 'lines') as any[])
    : [];
  const toothDetails = Array.isArray(getProp(rxToShow, 'toothDetails'))
    ? (getProp(rxToShow, 'toothDetails') as any[])
    : [];

  // ✅ doctorNotes should be displayed/printed in prescription
  const doctorNotes =
    isRecord(rxToShow) && typeof getProp(rxToShow, 'doctorNotes') !== 'undefined'
      ? String(getProp(rxToShow, 'doctorNotes') ?? '')
      : '';

  /* ---------------- patient age / sex FIX ---------------- */

  const patientDobRaw = getProp(patient, 'dob');
  const patientAgeRaw = getProp(patient, 'age');
  const patientSexRaw = getProp(patient, 'gender');

  const visitAt = new Date(getPropNumber(visit, 'createdAt') ?? Date.now());

  const dob = safeParseDobToDate(patientDobRaw);
  const ageFromDob = dob ? calculateAge(dob, visitAt) : undefined;
  const ageStored =
    typeof patientAgeRaw === 'number' && Number.isFinite(patientAgeRaw) ? patientAgeRaw : undefined;

  const patientAge = ageFromDob ?? ageStored;
  const patientSex = normalizeSex(patientSexRaw);

  // ✅ NEW: patient registration date (formatted) for prescription header
  const patientRegdDate = React.useMemo(() => formatPatientRegdDate(patient), [patient]);

  /* ---------------- rx chain ---------------- */

  const rxChain = React.useMemo(() => {
    const meta = new Map<string, Visit>();
    if (visit?.visitId) meta.set(visit.visitId, visit);

    if (!showHistory) {
      return { visitIds: [visitId], meta, currentVisitId: visitId };
    }

    for (const v of allVisitsRaw) {
      if (v?.visitId) meta.set(v.visitId, v);
    }
    if (visit?.visitId) meta.set(visit.visitId, visit);

    const tag = getPropString(visit as unknown, 'tag');
    const anchorVisitId = getPropString(visit as unknown, 'anchorVisitId');
    const anchorId = tag === 'F' ? anchorVisitId : visitId;
    if (!anchorId) return { visitIds: [visitId], meta, currentVisitId: visitId };

    const anchor = meta.get(anchorId);
    const chain: Visit[] = [];
    if (anchor) chain.push(anchor);

    for (const v of meta.values()) {
      const aId = anchorIdFromVisit(v);
      if (aId && aId === anchorId && v.visitId !== anchorId) chain.push(v);
    }

    const seen = new Set<string>();
    const ids = chain.map((v) => v.visitId).filter((id) => id && !seen.has(id) && seen.add(id));

    return { visitIds: ids, meta, currentVisitId: visitId };
  }, [allVisitsRaw, showHistory, visit, visitId]);

  /* ---------------- quick look dialogs ---------------- */

  const [rxQuickOpen, setRxQuickOpen] = React.useState(false);
  const [xrayQuickOpen, setXrayQuickOpen] = React.useState(false);
  const [quickVisitId, setQuickVisitId] = React.useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-6 rounded-2xl border bg-white p-4">
          <div className="mb-3 flex gap-2">
            <div>
              <div className="flex gap-1 items-center">
                <ClipboardList className="h-4 w-4 text-gray-700" />
                <div className="text-sm font-semibold text-gray-900">Prescription</div>
              </div>
              <div className="text-xs text-gray-500">{visitDate?.trim() ?? ''}</div>
            </div>

            <div className="ml-auto">
              <button
                type="button"
                className={[
                  'rounded-full px-3 py-1 text-[11px] font-medium cursor-pointer',
                  showHistory
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200',
                ].join(' ')}
                onClick={() => setShowHistory((v) => !v)}
              >
                {showHistory ? 'Hide history' : 'Show history'}
              </button>
            </div>
          </div>

          <PrescriptionPreview
            patientName={getProp(patient, 'name') as any}
            patientPhone={getProp(patient, 'phone') as any}
            patientAge={patientAge}
            patientSex={patientSex}
            sdId={getProp(patient, 'sdId') as any}
            opdNo={opdNo}
            doctorName={doctorName}
            doctorRegdLabel={doctorRegdLabel}
            visitDateLabel={visitDateLabel}
            regdDate={patientRegdDate} // ✅ NEW: patient registration date
            lines={lines as any}
            doctorNotes={doctorNotes}
            receptionNotes={
              isRecord(rxToShow) ? String(getProp(rxToShow, 'receptionNotes') ?? '') : ''
            }
            toothDetails={toothDetails as any}
            currentVisitId={showHistory ? rxChain.currentVisitId : undefined}
            chainVisitIds={showHistory ? rxChain.visitIds : undefined}
            visitMetaMap={showHistory ? rxChain.meta : undefined}
          />
        </Card>

        <Card className="lg:col-span-6 rounded-2xl border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-gray-700" />
            <div className="text-sm font-semibold text-gray-900">X-rays</div>
          </div>
          <XrayTrayReadOnly visitId={visitId} />
        </Card>
      </div>

      <DoctorVisitHistoryPanel
        patientId={patientId}
        onOpenVisit={(vId) => router.push(`/doctor/visits/${vId}`)}
        onOpenRxQuick={(id) => {
          setQuickVisitId(id);
          setRxQuickOpen(true);
        }}
        onOpenXrayQuick={(id) => {
          setQuickVisitId(id);
          setXrayQuickOpen(true);
        }}
      />

      <VisitPrescriptionQuickLookDialog
        open={rxQuickOpen}
        onOpenChange={setRxQuickOpen}
        visitId={quickVisitId}
        patientId={patientId}
      />

      <VisitXrayQuickLookDialog
        open={xrayQuickOpen}
        onOpenChange={setXrayQuickOpen}
        visitId={quickVisitId}
      />
    </>
  );
}
