// apps/web/app/(doctor)/doctor/visits/[visitId]/page.tsx
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { PrescriptionPreview } from '@/components/prescription/PrescriptionPreview';
import { XrayTrayReadOnly } from '@/components/xray/XrayTrayReadOnly';

import {
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetVisitRxQuery,
  useUpdateVisitStatusMutation,
  useGetDoctorsQuery,
  useGetPatientVisitsQuery,
  useStartVisitRxRevisionMutation,
} from '@/src/store/api';

import { useAuth } from '@/src/hooks/useAuth';
import {
  ArrowRight,
  Calendar as CalendarIcon,
  ClipboardList,
  Image as ImageIcon,
  Stethoscope,
} from 'lucide-react';

import type { ToothDetail, Visit } from '@dcm/types';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { PaginationControl } from '@/components/ui/pagination-control';

import { clinicDateISO, formatClinicDateShort } from '@/src/lib/clinicTime';

type PatientSex = 'M' | 'F' | 'O' | 'U';

type DoctorLite = {
  doctorId: string;
  fullName?: string;
  displayName?: string;
  name?: string;
  registrationNumber?: string;
};

type VisitExtras = {
  isOffline?: boolean;
  opdNo?: string;
  opdId?: string;
  opdNumber?: string;
  tag?: string;
  anchorVisitId?: string;
};
type VisitWithExtras = Visit & VisitExtras;

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function getString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function getProp(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

function getPropString(obj: unknown, key: string): string | undefined {
  return getString(getProp(obj, key));
}

function getPropNumber(obj: unknown, key: string): number | undefined {
  const v = getProp(obj, key);
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;

  if (isRecord(err)) {
    const data = getProp(err, 'data');
    if (isRecord(data)) {
      const msg = getString(getProp(data, 'message'));
      if (msg) return msg;
    }
    const msg = getString(getProp(err, 'message'));
    if (msg) return msg;
  }
  return 'Request failed.';
}

function safeSexFromPatient(p: unknown): PatientSex {
  const raw = String(getProp(p, 'gender') ?? getProp(p, 'sex') ?? getProp(p, 'patientSex') ?? '')
    .trim()
    .toUpperCase();

  if (raw === 'M' || raw === 'MALE') return 'M';
  if (raw === 'F' || raw === 'FEMALE') return 'F';
  if (raw === 'O' || raw === 'OTHER') return 'O';
  return 'U';
}

function parseDob(dob?: string): Date | null {
  if (!dob) return null;
  const s = String(dob).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const d = new Date(y, mm - 1, dd);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function calcAgeYears(dob?: string, onDate?: string): number | null {
  const birth = parseDob(dob);
  if (!birth) return null;

  const ref = onDate ? parseDob(onDate) : null;
  const today = ref ?? new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;

  if (!Number.isFinite(age) || age < 0 || age > 130) return null;
  return age;
}

function stageLabel(status?: string) {
  if (status === 'QUEUED') return 'Waiting';
  if (status === 'IN_PROGRESS') return 'In Progress';
  if (status === 'DONE') return 'Done';
  return '—';
}

function stageBadgeClass(status?: string) {
  if (status === 'QUEUED') return 'bg-pink-100 text-pink-700 border-pink-200';
  if (status === 'IN_PROGRESS') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (status === 'DONE') return 'bg-green-100 text-green-700 border-green-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function safeParseDate(input: unknown): Date | null {
  if (!input) return null;
  if (input instanceof Date) return Number.isFinite(input.getTime()) ? input : null;

  if (typeof input === 'number') {
    const d = new Date(input);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  return null;
}

function calcAgeYearsFromDates(dob: Date, at: Date): number {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age -= 1;
  return age < 0 ? 0 : age;
}

type RxLineLike = Record<string, unknown>;

function lineToText(line: unknown): string {
  const rec: RxLineLike = isRecord(line) ? line : {};

  const med =
    (typeof rec.medicineName === 'string' && rec.medicineName.trim()) ||
    (typeof rec.medicine === 'string' && rec.medicine.trim()) ||
    'Medicine';

  const dose = rec.dose != null ? String(rec.dose) : '';
  const freq = rec.frequency != null ? String(rec.frequency) : '';
  const days =
    rec.days !== undefined && rec.days !== null && rec.days !== '' ? String(rec.days) : '';
  const timing = rec.timing != null ? String(rec.timing) : '';
  const notes = rec.notes != null ? String(rec.notes) : '';

  const parts = [dose, freq, days ? `${days} days` : '', timing].filter(Boolean);
  return `${med}${parts.length ? ` — ${parts.join(' · ')}` : ''}${notes ? ` — ${notes}` : ''}`;
}

function MedicinesReadOnly({ lines }: { lines: unknown[] }) {
  if (!lines.length) return <div className="mt-3 text-sm text-gray-500">No medicines added.</div>;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="font-semibold text-gray-600">#</TableHead>
            <TableHead className="font-semibold text-gray-600">Medicine</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l, idx) => {
            const rec: UnknownRecord = isRecord(l) ? l : {};
            const idVal = rec['id'];
            const rxLineIdVal = rec['rxLineId'];

            const key =
              typeof idVal === 'string'
                ? idVal
                : typeof rxLineIdVal === 'string'
                  ? rxLineIdVal
                  : `${idx}`;

            return (
              <TableRow key={key} className="hover:bg-gray-50/60">
                <TableCell className="w-[60px] text-gray-700">{idx + 1}</TableCell>
                <TableCell className="text-gray-800">{lineToText(l)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function VisitPrescriptionQuickLookDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: string | null;

  patientId?: string;
  patientName?: string;
  patientPhone?: string;

  patientSdId?: string;
  opdNo?: string;

  doctorName?: string;
  doctorRegdLabel?: string;
}) {
  const {
    open,
    onOpenChange,
    visitId,
    patientId,
    patientName,
    patientPhone,
    patientSdId,
    opdNo,
    doctorName,
    doctorRegdLabel,
  } = props;

  const rxQuery = useGetVisitRxQuery({ visitId: visitId ?? '' }, { skip: !open || !visitId });
  const visitQuery = useGetVisitByIdQuery(visitId ?? '', { skip: !open || !visitId });
  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !open || !patientId });

  const visitsQuery = useGetPatientVisitsQuery(patientId ?? '', {
    skip: !open || !patientId,
    refetchOnMountOrArgChange: true,
  });

  const allVisitsRaw = React.useMemo(() => {
    const items = getProp(visitsQuery.data, 'items');
    return Array.isArray(items) ? (items as Visit[]) : [];
  }, [visitsQuery.data]);

  const visitCreatedAtDate = React.useMemo(() => {
    const d = visitQuery.data;
    const createdAt = getProp(d, 'createdAt');
    return safeParseDate(createdAt);
  }, [visitQuery.data]);

  const visitDateLabelComputed = React.useMemo(() => {
    const ms = visitCreatedAtDate?.getTime();
    return ms ? `Visit: ${clinicDateISO(new Date(ms))}` : '';
  }, [visitCreatedAtDate]);

  const patientSex = React.useMemo(() => {
    const raw = String(
      getProp(patientQuery.data, 'gender') ??
        getProp(patientQuery.data, 'sex') ??
        getProp(patientQuery.data, 'patientSex') ??
        '',
    )
      .trim()
      .toUpperCase();

    if (raw === 'M' || raw === 'F' || raw === 'O' || raw === 'U') return raw as PatientSex;
    if (raw === 'MALE') return 'M';
    if (raw === 'FEMALE') return 'F';
    if (raw === 'OTHER') return 'O';
    return undefined;
  }, [patientQuery.data]);

  const patientAge = React.useMemo(() => {
    const dobRaw =
      getProp(patientQuery.data, 'dob') ??
      getProp(patientQuery.data, 'dateOfBirth') ??
      getProp(patientQuery.data, 'birthDate') ??
      getProp(patientQuery.data, 'dobIso') ??
      null;

    const dob = safeParseDate(dobRaw);
    const at = visitCreatedAtDate ?? new Date();
    if (!dob) return undefined;
    return calcAgeYearsFromDates(dob, at);
  }, [patientQuery.data, visitCreatedAtDate]);

  const rxUnknown = getProp(rxQuery.data, 'rx');
  const currentLinesUnknown = isRecord(rxUnknown) ? getProp(rxUnknown, 'lines') : undefined;
  const currentLines = Array.isArray(currentLinesUnknown) ? currentLinesUnknown : [];

  const currentToothDetails = React.useMemo<ToothDetail[]>(() => {
    if (!rxUnknown || !isRecord(rxUnknown)) return [];
    const td = getProp(rxUnknown, 'toothDetails');
    return Array.isArray(td) ? (td as ToothDetail[]) : [];
  }, [rxUnknown]);

  const rxChain = React.useMemo(() => {
    const selectedId = visitId ?? '';
    const meta = new Map<string, Visit>();

    for (const v of allVisitsRaw) meta.set(v.visitId, v);

    const vd = visitQuery.data;
    const vdId = getPropString(vd, 'visitId');
    if (vdId) meta.set(vdId, vd as unknown as Visit);

    const vSelected = meta.get(selectedId) ?? (vd as unknown as Visit | undefined);

    const tag = getPropString(vSelected, 'tag');
    const anchorVisitId = getPropString(vSelected, 'anchorVisitId');

    const anchorId = tag === 'F' ? anchorVisitId : selectedId;
    if (!anchorId)
      return { visitIds: selectedId ? [selectedId] : [], meta, currentVisitId: selectedId };

    const chain: Visit[] = [];
    const anchor = meta.get(anchorId);
    if (anchor) chain.push(anchor);

    const followups: Visit[] = [];
    for (const v of meta.values()) {
      const aId = getPropString(v, 'anchorVisitId');
      if (aId && aId === anchorId && v.visitId !== anchorId) followups.push(v);
    }
    followups.sort(
      (a, b) => (getPropNumber(a, 'createdAt') ?? 0) - (getPropNumber(b, 'createdAt') ?? 0),
    );
    chain.push(...followups);

    if (selectedId && !chain.some((x) => x.visitId === selectedId)) {
      const cur = meta.get(selectedId);
      chain.push(cur ?? ({ visitId: selectedId } as Visit));
    }

    chain.sort(
      (a, b) =>
        (getPropNumber(a, 'createdAt') ?? getPropNumber(a, 'updatedAt') ?? 0) -
        (getPropNumber(b, 'createdAt') ?? getPropNumber(b, 'updatedAt') ?? 0),
    );

    const seen = new Set<string>();
    const chainIdsOrdered = chain
      .map((x) => x.visitId)
      .filter((id) => {
        if (!id) return false;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

    const idx = selectedId ? chainIdsOrdered.indexOf(selectedId) : -1;
    const limitedIds = idx >= 0 ? chainIdsOrdered.slice(0, idx + 1) : chainIdsOrdered;

    return { visitIds: limitedIds, meta, currentVisitId: selectedId };
  }, [allVisitsRaw, visitId, visitQuery.data]);

  const selectedVisitOpdNo = React.useMemo(() => {
    const vUnknown: unknown = visitQuery.data;
    const raw =
      getProp(vUnknown, 'opdNo') ??
      getProp(vUnknown, 'opdNumber') ??
      getProp(vUnknown, 'opdId') ??
      getProp(vUnknown, 'opd') ??
      getProp(vUnknown, 'opd_no') ??
      getProp(vUnknown, 'opd_no_str') ??
      undefined;

    const s = raw == null ? '' : String(raw).trim();
    return s || undefined;
  }, [visitQuery.data]);

  type PreviewProps = React.ComponentProps<typeof PrescriptionPreview>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>Prescription</DialogTitle>
        </DialogHeader>

        <div className="min-w-0 overflow-x-hidden rounded-2xl border bg-white p-4">
          {rxQuery.isFetching || visitQuery.isFetching || patientQuery.isFetching ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : !visitId ? (
            <div className="text-sm text-gray-500">Invalid visit.</div>
          ) : (
            <PrescriptionPreview
              patientName={
                (getProp(patientQuery.data, 'name') as PreviewProps['patientName']) ?? patientName
              }
              patientPhone={
                (getProp(patientQuery.data, 'phone') as PreviewProps['patientPhone']) ??
                patientPhone
              }
              patientAge={patientAge}
              patientSex={patientSex}
              sdId={(getProp(patientQuery.data, 'sdId') as string | undefined) ?? patientSdId}
              opdNo={selectedVisitOpdNo ?? opdNo}
              doctorName={doctorName}
              doctorRegdLabel={doctorRegdLabel}
              visitDateLabel={visitDateLabelComputed}
              lines={currentLines as PreviewProps['lines']}
              toothDetails={currentToothDetails}
              currentVisitId={rxChain.currentVisitId}
              chainVisitIds={rxChain.visitIds}
              visitMetaMap={rxChain.meta}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VisitXrayQuickLookDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: string | null;
}) {
  const { open, onOpenChange, visitId } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>X-rays</DialogTitle>
        </DialogHeader>
        {!visitId ? null : <XrayTrayReadOnly visitId={visitId} />}
      </DialogContent>
    </Dialog>
  );
}

// Grouping helpers
function anchorIdFromVisit(v: Visit): string | undefined {
  return getPropString(v, 'anchorVisitId') ?? getPropString(v, 'anchorId') ?? undefined;
}

function isZeroBilledVisit(v: Visit): boolean {
  return Boolean(getProp(v, 'zeroBilled'));
}

function isOfflineVisit(v: Visit): boolean {
  return Boolean(getProp(v, 'isOffline'));
}

function typeBadgeClass(kind: 'NEW' | 'FOLLOWUP') {
  if (kind === 'NEW') return 'bg-sky-100 text-sky-700 border-sky-200';
  return 'bg-violet-100 text-violet-700 border-violet-200';
}

function zeroBilledBadgeClass() {
  return 'bg-rose-100 text-rose-700 border-rose-200';
}

function offlineBadgeClass() {
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function stageLabel2(status?: Visit['status']) {
  if (status === 'QUEUED') return 'Waiting';
  if (status === 'IN_PROGRESS') return 'In Progress';
  if (status === 'DONE') return 'Done';
  return '—';
}

function stageBadgeClass2(status?: Visit['status']) {
  if (status === 'QUEUED') return 'bg-pink-100 text-pink-700 border-pink-200';
  if (status === 'IN_PROGRESS') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (status === 'DONE') return 'bg-green-100 text-green-700 border-green-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

export default function DoctorVisitPage() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();
  const auth = useAuth();

  const visitId = React.useMemo(() => String(params?.visitId ?? ''), [params?.visitId]);
  const doctorId = auth.userId ?? '';

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const visit = (visitQuery.data ?? null) as VisitWithExtras | null;

  const isOffline = Boolean(visit?.isOffline);

  const patientId = visit?.patientId ?? '';
  const patientQuery = useGetPatientByIdQuery(patientId, { skip: !patientId });
  const patient = patientQuery.data ?? null;

  // Base Rx query (latest by default)
  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: !visitId });
  const rxLatest = (getProp(rxQuery.data, 'rx') as unknown) ?? null;

  const visitsQuery = useGetPatientVisitsQuery(patientId, { skip: !patientId });
  const allVisitsRaw = React.useMemo(() => {
    const items = getProp(visitsQuery.data, 'items');
    return Array.isArray(items) ? (items as Visit[]) : [];
  }, [visitsQuery.data]);

  const rxChain = React.useMemo(() => {
    const meta = new Map<string, Visit>();
    for (const v of allVisitsRaw) meta.set(v.visitId, v);
    if (visit?.visitId) meta.set(visit.visitId, visit);

    const tag = getString(visit?.tag);
    const anchorVisitId = getString(visit?.anchorVisitId);

    const anchorId = tag === 'F' ? anchorVisitId : visitId;
    if (!anchorId) return { visitIds: [visitId], meta, currentVisitId: visitId };

    const anchor = meta.get(anchorId);
    const chain: Visit[] = [];
    if (anchor) chain.push(anchor);

    const followups: Visit[] = [];
    for (const v of meta.values()) {
      const aId = anchorIdFromVisit(v);
      if (aId && aId === anchorId && v.visitId !== anchorId) followups.push(v);
    }

    followups.sort(
      (a, b) =>
        (getPropNumber(a, 'createdAt') ?? getPropNumber(a, 'updatedAt') ?? 0) -
        (getPropNumber(b, 'createdAt') ?? getPropNumber(b, 'updatedAt') ?? 0),
    );
    chain.push(...followups);

    if (!chain.some((v) => v.visitId === visitId)) {
      const cur = meta.get(visitId);
      chain.push(cur ?? ({ visitId } as Visit));
    }

    chain.sort(
      (a, b) =>
        (getPropNumber(a, 'createdAt') ?? getPropNumber(a, 'updatedAt') ?? 0) -
        (getPropNumber(b, 'createdAt') ?? getPropNumber(b, 'updatedAt') ?? 0),
    );

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
  }, [allVisitsRaw, visit, visitId]);

  const [updateVisitStatus, updateVisitStatusState] = useUpdateVisitStatusMutation();
  const [startRevision, startRevisionState] = useStartVisitRxRevisionMutation();

  const doctorsQuery = useGetDoctorsQuery(undefined, { refetchOnMountOrArgChange: true });

  const doctorFromList = React.useMemo<DoctorLite | null>(() => {
    const list = doctorsQuery.data;
    if (!doctorId || !Array.isArray(list)) return null;

    const mapped = (list as unknown[]).filter(isRecord).map((d) => d as unknown as DoctorLite);

    return mapped.find((d) => d.doctorId === doctorId) ?? null;
  }, [doctorsQuery.data, doctorId]);

  const doctorLabel = React.useMemo(() => {
    const name = doctorFromList?.fullName ?? doctorFromList?.displayName ?? doctorFromList?.name;
    return name ?? (doctorId ? `Doctor (${doctorId})` : 'Doctor');
  }, [doctorFromList, doctorId]);

  const doctorRegdLabel = React.useMemo(() => {
    const reg = doctorFromList?.registrationNumber;
    return reg ? `B.D.S Regd. - ${reg}` : undefined;
  }, [doctorFromList]);

  const status = visit?.status;
  const isDone = status === 'DONE';

  const visitDate = visit?.visitDate ?? '';
  const visitDateLabel = visitDate ? `Visit: ${visitDate}` : undefined;

  const patientSex = safeSexFromPatient(patient);
  const patientAge = calcAgeYears(getPropString(patient, 'dob'), visitDate) ?? undefined;

  const opdNo = getString(visit?.opdNo) ?? getString(visit?.opdId) ?? undefined;

  const loading = visitQuery.isLoading || patientQuery.isLoading;
  const hasError = visitQuery.isError || patientQuery.isError;

  // Offline visits: doctor should NOT start session
  const sessionMuted = isOffline === true;
  const sessionMutedReason =
    'This is an offline visit. Session editing is disabled in Doctor view.';

  // -------- Rx version dropdown (DONE visits) --------
  const [selectedRxVersion, setSelectedRxVersion] = React.useState<number | null>(null);

  const latestVersionFromRx = React.useMemo(() => {
    if (!rxLatest || !isRecord(rxLatest)) return null;
    const v = getProp(rxLatest, 'version');
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
  }, [rxLatest]);

  const versionOptions = React.useMemo(() => {
    const latest = latestVersionFromRx;
    if (!latest) return [];
    return Array.from({ length: latest }, (_, i) => latest - i);
  }, [latestVersionFromRx]);

  React.useEffect(() => {
    if (!isDone) return;
    if (selectedRxVersion != null) return;
    if (latestVersionFromRx != null) setSelectedRxVersion(latestVersionFromRx);
  }, [isDone, latestVersionFromRx, selectedRxVersion]);

  const rxByVersionQuery = useGetVisitRxQuery(
    { visitId, version: selectedRxVersion ?? undefined },
    { skip: !visitId || !isDone || selectedRxVersion == null },
  );

  const rxToShow = React.useMemo(() => {
    const r = getProp(rxByVersionQuery.data, 'rx') ?? null;
    return r ?? rxLatest;
  }, [rxByVersionQuery.data, rxLatest]);

  const toothDetails = React.useMemo<ToothDetail[]>(() => {
    if (!rxToShow || !isRecord(rxToShow)) return [];
    const td = getProp(rxToShow, 'toothDetails');
    return Array.isArray(td) ? (td as ToothDetail[]) : [];
  }, [rxToShow]);

  const onStartRevision = async () => {
    if (!visitId) return;

    if (sessionMuted) {
      toast.info(sessionMutedReason);
      return;
    }

    try {
      await startRevision({ visitId }).unwrap();
      toast.success('Revision started.');
      router.push(`/doctor/visits/${visitId}/prescription`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) ?? 'Failed to start revision.');
    }
  };

  const openSession = async () => {
    if (sessionMuted) {
      toast.info(sessionMutedReason);
      return;
    }

    if (!visitId) return;

    if (!doctorId) {
      toast.error('Missing doctor session. Please re-login.');
      return;
    }

    if (status === 'IN_PROGRESS') {
      router.push(`/doctor/visits/${visitId}/prescription`);
      return;
    }

    if (status === 'QUEUED') {
      try {
        await updateVisitStatus({
          visitId,
          status: 'IN_PROGRESS',
          date: visit?.visitDate,
        }).unwrap();

        toast.success('Session started.');
        router.push(`/doctor/visits/${visitId}/prescription`);
      } catch (err: unknown) {
        toast.error(getErrorMessage(err) ?? 'Failed to start session.');
      }
      return;
    }

    router.push(`/doctor/visits/${visitId}/prescription`);
  };

  // Previous Visits table
  const allDoneVisits = React.useMemo(() => {
    return [...allVisitsRaw]
      .filter((v) => getPropString(v, 'status') === 'DONE')
      .sort(
        (a, b) =>
          (getPropNumber(b, 'updatedAt') ?? getPropNumber(b, 'createdAt') ?? 0) -
          (getPropNumber(a, 'updatedAt') ?? getPropNumber(a, 'createdAt') ?? 0),
      );
  }, [allVisitsRaw]);

  const [datePickerOpen, setDatePickerOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(undefined);

  const selectedDateStr = React.useMemo(
    () => (selectedDate ? clinicDateISO(selectedDate) : null),
    [selectedDate],
  );

  const filteredVisits = React.useMemo(() => {
    if (!selectedDateStr) return allDoneVisits;
    return allDoneVisits.filter((v) => getPropString(v, 'visitDate') === selectedDateStr);
  }, [allDoneVisits, selectedDateStr]);

  const visitById = React.useMemo(() => {
    const map = new Map<string, Visit>();
    for (const v of allDoneVisits) map.set(v.visitId, v);
    return map;
  }, [allDoneVisits]);

  const groups = React.useMemo(() => {
    type Group = { anchor: Visit; followups: Visit[] };

    const anchorMap = new Map<string, Group>();
    const orphanFollowups: Visit[] = [];

    for (const v of filteredVisits) {
      const aId = anchorIdFromVisit(v);
      if (!aId) anchorMap.set(v.visitId, { anchor: v, followups: [] });
    }

    for (const v of filteredVisits) {
      const aId = anchorIdFromVisit(v);
      if (!aId) continue;

      const g = anchorMap.get(aId);
      if (g) g.followups.push(v);
      else orphanFollowups.push(v);
    }

    for (const g of anchorMap.values()) {
      g.followups.sort(
        (a, b) => (getPropNumber(a, 'createdAt') ?? 0) - (getPropNumber(b, 'createdAt') ?? 0),
      );
    }

    const anchorsOrdered = Array.from(anchorMap.values()).sort(
      (a, b) =>
        (getPropNumber(b.anchor, 'updatedAt') ?? getPropNumber(b.anchor, 'createdAt') ?? 0) -
        (getPropNumber(a.anchor, 'updatedAt') ?? getPropNumber(a.anchor, 'createdAt') ?? 0),
    );

    const orphanGroups = orphanFollowups
      .sort(
        (a, b) =>
          (getPropNumber(b, 'updatedAt') ?? getPropNumber(b, 'createdAt') ?? 0) -
          (getPropNumber(a, 'updatedAt') ?? getPropNumber(a, 'createdAt') ?? 0),
      )
      .map((followup) => ({ followup }));

    return { anchorsOrdered, orphanGroups };
  }, [filteredVisits]);

  const PAGE_SIZE = 2;
  const [page, setPage] = React.useState(1);
  React.useEffect(() => setPage(1), [selectedDateStr, allVisitsRaw]);

  const totalAnchorPages = Math.max(1, Math.ceil(groups.anchorsOrdered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalAnchorPages);

  const pageAnchors = React.useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return groups.anchorsOrdered.slice(start, start + PAGE_SIZE);
  }, [groups.anchorsOrdered, pageSafe]);

  const dateLabel = selectedDateStr ?? 'Pick a date';

  const openVisit = (v: Visit) => router.push(`/doctor/visits/${v.visitId}`);

  const [rxQuickOpen, setRxQuickOpen] = React.useState(false);
  const [xrayQuickOpen, setXrayQuickOpen] = React.useState(false);
  const [quickVisitId, setQuickVisitId] = React.useState<string | null>(null);

  const openRxQuick = (visitIdToOpen: string) => {
    setQuickVisitId(visitIdToOpen);
    setRxQuickOpen(true);
  };
  const openXrayQuick = (visitIdToOpen: string) => {
    setQuickVisitId(visitIdToOpen);
    setXrayQuickOpen(true);
  };

  const renderReasonCell = (
    visitRow: Visit,
    opts: { kind: 'NEW' | 'FOLLOWUP'; anchor?: Visit },
  ) => {
    let followupCount = 0;
    if (opts.kind === 'NEW') {
      const anchorId = visitRow.visitId;
      for (const v of allDoneVisits) {
        if (anchorIdFromVisit(v) === anchorId) followupCount += 1;
      }
    }

    const followupOfText =
      opts.kind === 'FOLLOWUP'
        ? (() => {
            const a =
              opts.anchor ??
              (anchorIdFromVisit(visitRow)
                ? visitById.get(anchorIdFromVisit(visitRow)!)
                : undefined);

            const aReason = String(getProp(a, 'reason') ?? '—');
            const aDateRaw = getPropString(a, 'visitDate');
            const aDate = aDateRaw ? formatClinicDateShort(aDateRaw) : '—';
            return `Follow-up of: ${aReason} • ${aDate}`;
          })()
        : null;

    const reason = String(getProp(visitRow, 'reason') ?? '').trim();

    return (
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-gray-900">{reason ? reason : '—'}</div>

        <div className="mt-0.5 text-[11px] text-gray-500">
          {opts.kind === 'NEW' ? (
            <span className="inline-flex items-center gap-2">
              <span className="rounded-md bg-gray-50 px-2 py-0.5 text-gray-600 shadow-[0_0_0_1px_rgba(0,0,0,0.04)]">
                {followupCount} follow-up{followupCount === 1 ? '' : 's'}
              </span>
            </span>
          ) : (
            <span className="truncate">{followupOfText}</span>
          )}
        </div>
      </div>
    );
  };

  const hasRows = pageAnchors.length > 0 || groups.orphanGroups.length > 0;

  if (!visitId) {
    return (
      <section className="p-6">
        <p className="text-sm text-red-600">Invalid visit id.</p>
      </section>
    );
  }

  type PreviewProps = React.ComponentProps<typeof PrescriptionPreview>;

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold text-gray-900">Visit</div>

            {isOffline ? (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                OFFLINE
              </span>
            ) : null}
          </div>

          <div className="mt-0.5 text-xs text-gray-500">
            Visit ID: <span className="font-medium text-gray-700">{visitId}</span>
            {visit?.tag ? (
              <>
                {' '}
                · Tag: <span className="font-medium text-gray-700">{visit.tag}</span>
              </>
            ) : null}{' '}
            · Stage: <span className="font-medium text-gray-700">{stageLabel(status)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {status ? (
            <Badge
              variant="outline"
              className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(status)}`}
            >
              {stageLabel(status)}
            </Badge>
          ) : null}

          {isDone ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={onStartRevision}
              disabled={sessionMuted || startRevisionState.isLoading || loading || hasError}
              title={sessionMuted ? sessionMutedReason : 'Start editing this DONE visit'}
            >
              {startRevisionState.isLoading ? 'Starting…' : 'Start Revision'}
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => router.back()}
          >
            Back
          </Button>

          {!isDone ? (
            <Button
              type="button"
              className={[
                'rounded-xl',
                sessionMuted
                  ? 'bg-gray-200 text-gray-600 hover:bg-gray-200'
                  : 'bg-black text-white hover:bg-black/90',
              ].join(' ')}
              onClick={openSession}
              disabled={sessionMuted || updateVisitStatusState.isLoading || loading || hasError}
              title={sessionMuted ? sessionMutedReason : undefined}
            >
              {sessionMuted
                ? 'Session disabled'
                : updateVisitStatusState.isLoading
                  ? 'Starting…'
                  : status === 'IN_PROGRESS'
                    ? 'Continue Session'
                    : 'Start Session'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {isOffline ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-2 w-2 rounded-full bg-amber-500" />
            <div className="min-w-0">
              <div className="font-semibold">Offline visit</div>
              <div className="mt-0.5 text-xs text-amber-700">
                Doctor session actions are disabled for offline visits. You can view the summary and
                history below.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {hasError ? (
        <Card className="rounded-2xl border bg-white p-6">
          <div className="text-sm text-red-600">Failed to load visit/patient.</div>
        </Card>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-5 rounded-2xl border bg-white p-6">
            <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
            <div className="mt-4 space-y-2">
              <div className="h-3 w-64 animate-pulse rounded bg-gray-100" />
              <div className="h-3 w-56 animate-pulse rounded bg-gray-100" />
              <div className="h-3 w-52 animate-pulse rounded bg-gray-100" />
            </div>
          </Card>
          <Card className="lg:col-span-7 rounded-2xl border bg-white p-6">
            <div className="h-4 w-56 animate-pulse rounded bg-gray-100" />
            <div className="mt-4 h-60 animate-pulse rounded-xl bg-gray-50" />
          </Card>
        </div>
      ) : isDone ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-6 rounded-2xl border bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-gray-700" />
                <div className="text-sm font-semibold text-gray-900">Prescription</div>
                <div className="ml-auto text-xs text-gray-500">
                  {visitDate ? visitDate.trim() : ''}
                </div>
              </div>

              {versionOptions.length > 0 ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-gray-50 px-3 py-2">
                  <div className="text-xs font-medium text-gray-700">
                    Prescription version
                    {selectedRxVersion != null ? (
                      <span className="text-gray-500">{` • v${selectedRxVersion}`}</span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      className="h-9 rounded-xl border bg-white px-3 text-sm"
                      value={selectedRxVersion ?? ''}
                      onChange={(e) => setSelectedRxVersion(Number(e.target.value))}
                      disabled={rxByVersionQuery.isFetching}
                    >
                      {versionOptions.map((v) => (
                        <option key={v} value={v}>
                          {v === versionOptions[0] ? `Latest (v${v})` : `Version ${v}`}
                        </option>
                      ))}
                    </select>

                    {rxByVersionQuery.isFetching ? (
                      <span className="text-xs text-gray-500">Loading…</span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="min-w-0 overflow-x-hidden">
                <PrescriptionPreview
                  patientName={getProp(patient, 'name') as PreviewProps['patientName']}
                  patientPhone={getProp(patient, 'phone') as PreviewProps['patientPhone']}
                  patientAge={patientAge}
                  patientSex={patientSex}
                  sdId={getProp(patient, 'sdId') as string | undefined}
                  opdNo={opdNo}
                  doctorName={doctorLabel}
                  doctorRegdLabel={doctorRegdLabel}
                  visitDateLabel={visitDateLabel}
                  lines={
                    Array.isArray(getProp(rxToShow, 'lines'))
                      ? (getProp(rxToShow, 'lines') as PreviewProps['lines'])
                      : []
                  }
                  receptionNotes={
                    isRecord(rxToShow) ? String(getProp(rxToShow, 'receptionNotes') ?? '') : ''
                  }
                  toothDetails={toothDetails}
                  currentVisitId={rxChain.currentVisitId}
                  chainVisitIds={rxChain.visitIds}
                  visitMetaMap={rxChain.meta}
                />
              </div>
            </Card>

            <Card className="lg:col-span-6 rounded-2xl border bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-gray-700" />
                <div className="text-sm font-semibold text-gray-900">X-rays</div>
                <div className="ml-auto text-xs text-gray-500">All images for this visit</div>
              </div>

              <div className="min-h-60">
                <XrayTrayReadOnly visitId={visitId} />
              </div>
            </Card>
          </div>

          <Card className="mt-4 w-full rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-900">Previous visits</div>

              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-[220px] justify-start gap-2 rounded-xl"
                  >
                    <CalendarIcon className="h-4 w-4" />
                    <span className={selectedDateStr ? 'text-gray-900' : 'text-gray-500'}>
                      {dateLabel}
                    </span>
                  </Button>
                </PopoverTrigger>

                <PopoverContent align="start" className="w-auto rounded-2xl p-2">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => {
                      setSelectedDate(d);
                      setDatePickerOpen(false);
                    }}
                  />
                  {selectedDateStr ? (
                    <div className="px-2 pb-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 rounded-xl text-xs"
                        onClick={() => {
                          setSelectedDate(undefined);
                          setDatePickerOpen(false);
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold text-gray-600">Visit Date</TableHead>
                    <TableHead className="font-semibold text-gray-600">Reason</TableHead>
                    <TableHead className="font-semibold text-gray-600">Type</TableHead>
                    <TableHead className="font-semibold text-gray-600">Stage</TableHead>
                    <TableHead className="text-right font-semibold text-gray-600">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {!patientId ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-gray-500">
                        Loading patient context…
                      </TableCell>
                    </TableRow>
                  ) : visitsQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-gray-500">
                        Loading visits…
                      </TableCell>
                    </TableRow>
                  ) : !hasRows ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-gray-500">
                        No visits found{selectedDateStr ? ` for ${selectedDateStr}` : ''}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {pageAnchors.map((g) => {
                        const anchor = g.anchor;
                        const followups = g.followups;

                        return (
                          <React.Fragment key={anchor.visitId}>
                            <TableRow className="hover:bg-gray-50/60">
                              <TableCell className="px-6 py-4 align-top text-sm font-medium text-gray-900">
                                {formatClinicDateShort(String(getProp(anchor, 'visitDate') ?? ''))}
                              </TableCell>

                              <TableCell className="px-6 py-4 align-top">
                                {renderReasonCell(anchor, { kind: 'NEW' })}
                              </TableCell>

                              <TableCell className="px-6 py-4 align-top">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`rounded-full px-4 py-1 text-[11px] font-semibold ${typeBadgeClass(
                                      'NEW',
                                    )}`}
                                  >
                                    NEW
                                  </Badge>

                                  {isZeroBilledVisit(anchor) ? (
                                    <Badge
                                      variant="outline"
                                      className={`rounded-full px-4 py-1 text-[11px] font-semibold ${zeroBilledBadgeClass()}`}
                                    >
                                      ZERO BILLED
                                    </Badge>
                                  ) : null}

                                  {isOfflineVisit(anchor) ? (
                                    <Badge
                                      variant="outline"
                                      className={`rounded-full px-3 py-0.5 text-[10px] font-semibold ${offlineBadgeClass()}`}
                                    >
                                      OFFLINE
                                    </Badge>
                                  ) : null}
                                </div>
                              </TableCell>

                              <TableCell className="px-6 py-4 align-top">
                                <Badge
                                  variant="outline"
                                  className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass2(
                                    getProp(anchor, 'status') as Visit['status'] | undefined,
                                  )}`}
                                >
                                  {stageLabel2(
                                    getProp(anchor, 'status') as Visit['status'] | undefined,
                                  )}
                                </Badge>
                              </TableCell>

                              <TableCell className="px-6 py-4 align-top text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 rounded-xl px-3 text-xs"
                                    onClick={() => openRxQuick(anchor.visitId)}
                                  >
                                    View Rx
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 rounded-xl px-3 text-xs"
                                    onClick={() => openXrayQuick(anchor.visitId)}
                                  >
                                    X-rays
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 rounded-xl px-3 text-xs"
                                    onClick={() => openVisit(anchor)}
                                  >
                                    View
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>

                            {followups.map((f) => (
                              <TableRow key={f.visitId} className="hover:bg-gray-50/60">
                                <TableCell className="px-6 py-2 align-top">
                                  <div className="flex items-center gap-3">
                                    <div className="ml-1 h-7 w-[2px] rounded-full bg-gray-200" />
                                    <div className="text-sm text-gray-900">
                                      {formatClinicDateShort(String(getProp(f, 'visitDate') ?? ''))}
                                    </div>
                                  </div>
                                </TableCell>

                                <TableCell className="px-6 py-2 align-top">
                                  <div className="flex items-start gap-3">
                                    <div className="ml-1 h-7 w-[2px] rounded-full bg-gray-200" />
                                    <div className="min-w-0 flex-1">
                                      {renderReasonCell(f, { kind: 'FOLLOWUP', anchor })}
                                    </div>
                                  </div>
                                </TableCell>

                                <TableCell className="px-6 py-2 align-top">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className={`rounded-full px-4 py-1 text-[11px] font-semibold ${typeBadgeClass(
                                        'FOLLOWUP',
                                      )}`}
                                    >
                                      FOLLOW UP
                                    </Badge>

                                    {isZeroBilledVisit(f) ? (
                                      <Badge
                                        variant="outline"
                                        className={`rounded-full px-4 py-1 text-[11px] font-semibold ${zeroBilledBadgeClass()}`}
                                      >
                                        ZERO BILLED
                                      </Badge>
                                    ) : null}

                                    {isOfflineVisit(f) ? (
                                      <Badge
                                        variant="outline"
                                        className={`rounded-full px-3 py-0.5 text-[10px] font-semibold ${offlineBadgeClass()}`}
                                      >
                                        OFFLINE
                                      </Badge>
                                    ) : null}
                                  </div>
                                </TableCell>

                                <TableCell className="px-6 py-2 align-top">
                                  <Badge
                                    variant="outline"
                                    className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass2(
                                      getProp(f, 'status') as Visit['status'] | undefined,
                                    )}`}
                                  >
                                    {stageLabel2(
                                      getProp(f, 'status') as Visit['status'] | undefined,
                                    )}
                                  </Badge>
                                </TableCell>

                                <TableCell className="px-6 py-2 align-top text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-8 rounded-xl px-3 text-xs"
                                      onClick={() => openRxQuick(f.visitId)}
                                    >
                                      View Rx
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-8 rounded-xl px-3 text-xs"
                                      onClick={() => openXrayQuick(f.visitId)}
                                    >
                                      X-rays
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-8 rounded-xl px-3 text-xs"
                                      onClick={() => openVisit(f)}
                                    >
                                      View
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </>
                  )}
                </TableBody>
              </Table>

              {groups.anchorsOrdered.length > PAGE_SIZE ? (
                <div className="border-t bg-white px-3 py-2">
                  <PaginationControl
                    page={pageSafe}
                    pageSize={PAGE_SIZE}
                    totalItems={groups.anchorsOrdered.length}
                    onPageChange={setPage}
                  />
                </div>
              ) : null}
            </div>
          </Card>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-5 rounded-2xl border bg-white p-6">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-gray-700" />
              <div className="text-sm font-semibold text-gray-900">Visit Overview</div>
            </div>

            <div className="mt-4 grid gap-3 text-sm text-gray-800">
              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Patient</div>
                <div className="font-semibold text-gray-900">
                  {String(getProp(patient, 'name') ?? '—')}
                </div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Phone</div>
                <div className="font-semibold text-gray-900">
                  {String(getProp(patient, 'phone') ?? '—')}
                </div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Age/Sex</div>
                <div className="font-semibold text-gray-900">
                  {patientAge ? String(patientAge) : '—'}/{patientSex ?? '—'}
                </div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">SD-ID</div>
                <div className="font-semibold text-gray-900">
                  {String(getProp(patient, 'sdId') ?? '—')}
                </div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">OPD No</div>
                <div className="font-semibold text-gray-900">{opdNo ?? '—'}</div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Visit Date</div>
                <div className="font-semibold text-gray-900">{visitDate ?? '—'}</div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Reason</div>
                <div className="font-semibold text-gray-900">
                  {String(getProp(visit, 'reason') ?? '—')}
                </div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Doctor</div>
                <div className="font-semibold text-gray-900">{doctorLabel}</div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Regd No</div>
                <div className="font-semibold text-gray-900">{doctorRegdLabel ?? '—'}</div>
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-7 rounded-2xl border bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Prescription</div>
                <div className="mt-1 text-xs text-gray-500">
                  Prescription preview and X-rays become visible only after the visit is marked as{' '}
                  <b>DONE</b>.
                </div>
              </div>

              <Badge
                variant="outline"
                className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(status)}`}
              >
                {stageLabel(status)}
              </Badge>
            </div>

            <div className="mt-5 rounded-2xl border bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">Session actions</div>

              <div className="mt-1 text-xs text-gray-600">
                {sessionMuted
                  ? 'This is an offline visit. Session actions are disabled.'
                  : status === 'IN_PROGRESS'
                    ? 'Continue the active session to add medicines, upload X-rays, and complete the visit.'
                    : 'Start the session to begin adding medicines and uploading X-rays.'}
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-gray-500">
                  Visit ID: <span className="font-medium text-gray-700">{visitId}</span>
                </div>

                <Button
                  type="button"
                  className={[
                    'rounded-2xl px-6',
                    sessionMuted
                      ? 'bg-gray-200 text-gray-600 hover:bg-gray-200'
                      : 'bg-black text-white hover:bg-black/90',
                  ].join(' ')}
                  onClick={openSession}
                  disabled={sessionMuted || updateVisitStatusState.isLoading}
                  title={sessionMuted ? sessionMutedReason : undefined}
                >
                  {sessionMuted
                    ? 'Session disabled'
                    : updateVisitStatusState.isLoading
                      ? 'Starting…'
                      : status === 'IN_PROGRESS'
                        ? 'Continue Session'
                        : 'Start Session'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl border p-4">
                <div className="text-xs font-semibold text-gray-700">What you’ll do next</div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-gray-600">
                  <li>Add medicines to Rx</li>
                  <li>Upload and review X-rays</li>
                  <li>Finalize and mark visit as DONE</li>
                </ul>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="text-xs font-semibold text-gray-700">Notes</div>
                <div className="mt-2 text-xs text-gray-600">
                  After marking visit as <b>DONE</b>, this page becomes the <b>read-only summary</b>{' '}
                  with Rx + X-rays.
                </div>
              </div>
            </div>

            {isOffline ? (
              <div className="mt-4 rounded-2xl border bg-white p-4">
                <div className="text-sm font-semibold text-gray-900">Offline summary</div>
                <div className="mt-1 text-xs text-gray-600">
                  Medicines (read-only). This visit was captured offline.
                </div>
                <MedicinesReadOnly
                  lines={
                    (rxLatest && isRecord(rxLatest) && Array.isArray(getProp(rxLatest, 'lines'))
                      ? (getProp(rxLatest, 'lines') as unknown[])
                      : []) as unknown[]
                  }
                />
              </div>
            ) : null}
          </Card>

          {/* Keep your remaining "Previous visits" non-DONE block as-is in your repo if it exists */}
        </div>
      )}

      <VisitPrescriptionQuickLookDialog
        open={rxQuickOpen}
        onOpenChange={(o) => setRxQuickOpen(o)}
        visitId={quickVisitId}
        patientId={patientId}
        patientName={getPropString(patient, 'name')}
        patientPhone={getPropString(patient, 'phone')}
        patientSdId={getPropString(patient, 'sdId')}
        opdNo={opdNo}
        doctorName={doctorLabel}
        doctorRegdLabel={doctorRegdLabel}
      />

      <VisitXrayQuickLookDialog
        open={xrayQuickOpen}
        onOpenChange={(o) => setXrayQuickOpen(o)}
        visitId={quickVisitId}
      />
    </section>
  );
}
