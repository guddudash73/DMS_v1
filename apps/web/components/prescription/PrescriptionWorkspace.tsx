'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RxLineType, Visit, ToothDetail } from '@dcm/types';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { PrescriptionPreview } from './PrescriptionPreview';
import { MedicinesEditor } from './MedicinesEditor';
import { RxPresetImportDialog } from './RxPresetImportDialog';
import { MultiToothDetailsEditor } from './ToothDetailsEditor';

import { XrayUploader } from '@/components/xray/XrayUploader';
import { XrayGallery } from '@/components/xray/XrayGallery';
import { XrayTrayReadOnly } from '@/components/xray/XrayTrayReadOnly';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import {
  useUpsertVisitRxMutation,
  useGetVisitRxQuery,
  useStartVisitRxRevisionMutation,
  useGetPatientVisitsQuery,
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetMeQuery,
} from '@/src/store/api';

import { clinicDateISO, clinicDateISOFromMs } from '@/src/lib/clinicTime';
import { useRouter } from 'next/navigation';

import { DoctorVisitHistoryPanel } from '@/components/doctor/visits/DoctorVisitHistoryPanel';

type PatientSex = 'M' | 'F' | 'O' | 'U';

type Props = {
  visitId: string;
  patientId?: string;
  patientName?: string;
  patientPhone?: string;
  patientSdId?: string;
  opdNo?: string;
  doctorName?: string;
  visitDateLabel?: string;
  visitStatus?: 'QUEUED' | 'IN_PROGRESS' | 'DONE';

  onRevisionModeChange?: (enabled: boolean) => void;
};

const DASHBOARD_PATH = '/doctor';

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

/* ------------------------------------------------------------------ */
/* patient helpers (backend-aligned: DOB preferred; fallback to age) */
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
/* time parse util (for createdAt etc) */
/* ------------------------------------------------------------------ */

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

function looksLikeDoctorIdLabel(name?: string) {
  if (!name) return true;
  const s = name.trim();
  if (!s) return true;

  if (/^Doctor\s*\(.+\)$/i.test(s)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;

  return false;
}

function lineToText(line: RxLineType): string {
  const rec: Record<string, unknown> = isRecord(line)
    ? (line as unknown as Record<string, unknown>)
    : {};

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

function MedicinesReadOnly({ lines }: { lines: RxLineType[] }) {
  if (!lines.length) {
    return <div className="mt-3 text-sm text-gray-500">No medicines added.</div>;
  }

  return (
    <div className="mt-3 space-y-2 rounded-2xl border p-3">
      {lines.map((l, idx) => {
        const rec: Record<string, unknown> = isRecord(l)
          ? (l as unknown as Record<string, unknown>)
          : {};
        const idVal = rec['id'];
        const rxLineIdVal = rec['rxLineId'];
        const key =
          typeof idVal === 'string'
            ? idVal
            : typeof rxLineIdVal === 'string'
              ? rxLineIdVal
              : `${idx}`;

        return (
          <div key={key} className="text-sm text-gray-800">
            <span className="mr-2 text-gray-500">{idx + 1}.</span>
            {lineToText(l)}
          </div>
        );
      })}
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
  const allVisitsRaw = (visitsQuery.data?.items ?? []) as Visit[];

  const visitCreatedAtDate = useMemo(() => {
    const dUnknown: unknown = visitQuery.data;
    const createdAt = isRecord(dUnknown) ? (dUnknown as any).createdAt : undefined;
    return safeParseDate(createdAt);
  }, [visitQuery.data]);

  const visitDateLabelComputed = useMemo(() => {
    const ms = visitCreatedAtDate?.getTime();
    return ms ? `Visit: ${clinicDateISOFromMs(ms)}` : '';
  }, [visitCreatedAtDate]);

  const patientSex = useMemo(() => {
    const pUnknown: unknown = patientQuery.data;
    const rec: Record<string, unknown> = isRecord(pUnknown) ? pUnknown : {};
    const raw = (rec as any).sex ?? (rec as any).gender ?? (rec as any).patientSex ?? undefined;
    return normalizeSex(raw);
  }, [patientQuery.data]);

  // ✅ DOB preferred, fallback to stored age, computed at visit createdAt
  const patientAge = useMemo(() => {
    const pUnknown: unknown = patientQuery.data;
    const rec: Record<string, unknown> = isRecord(pUnknown) ? pUnknown : {};

    const dobRaw =
      (rec as any).dob ??
      (rec as any).dateOfBirth ??
      (rec as any).birthDate ??
      (rec as any).dobIso ??
      null;
    const dob = safeParseDobToDate(dobRaw);

    const at = visitCreatedAtDate ?? new Date();
    const ageFromDob = dob ? calculateAge(dob, at) : undefined;
    const ageStored = getNumber((rec as any).age);

    return ageFromDob ?? ageStored;
  }, [patientQuery.data, visitCreatedAtDate]);

  // ✅ NEW: patient registration date for preview header
  const patientRegdDate = useMemo(() => {
    return formatPatientRegdDate(patientQuery.data);
  }, [patientQuery.data]);

  const currentLines = rxQuery.data?.rx?.lines ?? [];
  const currentDoctorNotes = (rxQuery.data?.rx as any)?.doctorNotes;
  const currentDoctorNotesStr = typeof currentDoctorNotes === 'string' ? currentDoctorNotes : '';

  const currentToothDetails = useMemo<ToothDetail[]>(() => {
    const rUnknown: unknown = rxQuery.data?.rx;
    if (!rUnknown || !isRecord(rUnknown)) return [];
    const td = (rUnknown as any).toothDetails;
    return Array.isArray(td) ? (td as ToothDetail[]) : [];
  }, [rxQuery.data]);

  const rxChain = useMemo(() => {
    const selectedId = visitId ?? '';
    const meta = new Map<string, Visit>();

    for (const v of allVisitsRaw) meta.set(v.visitId, v);

    const vqUnknown: unknown = visitQuery.data;
    if (isRecord(vqUnknown) && typeof (vqUnknown as any).visitId === 'string') {
      meta.set((vqUnknown as any).visitId, vqUnknown as unknown as Visit);
    }

    const vSelected = meta.get(selectedId) ?? (vqUnknown as unknown as Visit | undefined);

    const selRec: Record<string, unknown> = isRecord(vSelected)
      ? (vSelected as unknown as Record<string, unknown>)
      : {};
    const tag = getString((selRec as any).tag);
    const anchorVisitId = getString((selRec as any).anchorVisitId);

    const anchorId = tag === 'F' ? anchorVisitId : selectedId;
    if (!anchorId)
      return { visitIds: selectedId ? [selectedId] : [], meta, currentVisitId: selectedId };

    const chain: Visit[] = [];

    const anchor = meta.get(anchorId);
    if (anchor) chain.push(anchor);

    const followups: Visit[] = [];
    for (const v of meta.values()) {
      const vRec: Record<string, unknown> = isRecord(v)
        ? (v as unknown as Record<string, unknown>)
        : {};
      const aId = getString((vRec as any).anchorVisitId);
      if (aId && aId === anchorId && (v as any).visitId !== anchorId) followups.push(v);
    }
    followups.sort(
      (a, b) =>
        ((a as any).createdAt ?? (a as any).updatedAt ?? 0) -
        ((b as any).createdAt ?? (b as any).updatedAt ?? 0),
    );
    chain.push(...followups);

    if (selectedId && !chain.some((x) => (x as any).visitId === selectedId)) {
      const cur = meta.get(selectedId);
      chain.push(cur ?? ({ visitId: selectedId } as Visit));
    }

    chain.sort(
      (a, b) =>
        ((a as any).createdAt ?? (a as any).updatedAt ?? 0) -
        ((b as any).createdAt ?? (b as any).updatedAt ?? 0),
    );

    const seen = new Set<string>();
    const chainIdsOrdered = chain
      .map((x) => (x as any).visitId as string)
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

  const selectedVisitOpdNo = useMemo(() => {
    const vUnknown: unknown = visitQuery.data;
    const v = isRecord(vUnknown) ? vUnknown : {};
    const raw = (v as any).opdNo ?? (v as any).opdNumber ?? (v as any).opdId ?? (v as any).opd;
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
              patientName={(patientQuery.data as any)?.name ?? patientName}
              patientPhone={(patientQuery.data as any)?.phone ?? patientPhone}
              patientAge={patientAge}
              patientSex={patientSex}
              sdId={(patientQuery.data as any)?.sdId ?? patientSdId}
              opdNo={selectedVisitOpdNo ?? opdNo}
              doctorName={doctorName}
              doctorRegdLabel={doctorRegdLabel}
              visitDateLabel={visitDateLabelComputed}
              regdDate={patientRegdDate} // ✅ NEW
              lines={currentLines as PreviewProps['lines']}
              toothDetails={currentToothDetails}
              doctorNotes={currentDoctorNotesStr}
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

function anchorIdFromVisit(v: Visit): string | undefined {
  const rec: Record<string, unknown> = isRecord(v) ? (v as unknown as Record<string, unknown>) : {};
  return getString((rec as any).anchorVisitId) ?? getString((rec as any).anchorId) ?? undefined;
}

export function PrescriptionWorkspace(props: Props) {
  const {
    visitId,
    patientId,
    patientName,
    patientPhone,
    patientSdId,
    opdNo,
    doctorName,
    visitDateLabel: visitDateLabelFromParent,
    visitStatus: visitStatusFromProps,
    onRevisionModeChange,
  } = props;

  const router = useRouter();

  const meQuery = useGetMeQuery();

  const doctorNameFromMe =
    meQuery.data?.doctorProfile?.fullName ?? meQuery.data?.displayName ?? undefined;

  const doctorRegdNoFromMe = meQuery.data?.doctorProfile?.registrationNumber;

  const resolvedDoctorName = useMemo(() => {
    if (doctorName && !looksLikeDoctorIdLabel(doctorName)) return doctorName;
    if (doctorNameFromMe && !looksLikeDoctorIdLabel(doctorNameFromMe)) return doctorNameFromMe;
    return undefined;
  }, [doctorName, doctorNameFromMe]);

  const resolvedDoctorRegdLabel = useMemo(() => {
    if (doctorRegdNoFromMe) return `B.D.S Regd. - ${doctorRegdNoFromMe}`;
    return undefined;
  }, [doctorRegdNoFromMe]);

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !patientId });

  const resolvedVisitStatus =
    (visitQuery.data as Visit | undefined)?.status ?? visitStatusFromProps;

  const visitCreatedAtDate = useMemo(() => {
    const vUnknown: unknown = visitQuery.data;
    const createdAt = isRecord(vUnknown) ? (vUnknown as any).createdAt : undefined;
    return safeParseDate(createdAt);
  }, [visitQuery.data]);

  const computedVisitDateLabel = useMemo(() => {
    if (visitCreatedAtDate) return `Visit: ${clinicDateISO(visitCreatedAtDate)}`;
    return visitDateLabelFromParent ?? '';
  }, [visitCreatedAtDate, visitDateLabelFromParent]);

  // ✅ NEW: patient registration date (formatted) for PrescriptionPreview header
  const patientRegdDate = useMemo(() => {
    return formatPatientRegdDate(patientQuery.data);
  }, [patientQuery.data]);

  const patientSex = useMemo(() => {
    const pUnknown: unknown = patientQuery.data;
    const rec: Record<string, unknown> = isRecord(pUnknown) ? pUnknown : {};
    const raw = (rec as any).sex ?? (rec as any).gender ?? (rec as any).patientSex ?? undefined;
    return normalizeSex(raw);
  }, [patientQuery.data]);

  // ✅ DOB preferred, fallback to stored age, computed at visit createdAt
  const patientAge = useMemo(() => {
    const pUnknown: unknown = patientQuery.data;
    const rec: Record<string, unknown> = isRecord(pUnknown) ? pUnknown : {};

    const dobRaw =
      (rec as any).dob ??
      (rec as any).dateOfBirth ??
      (rec as any).birthDate ??
      (rec as any).dobIso ??
      null;
    const dob = safeParseDobToDate(dobRaw);

    const at = visitCreatedAtDate ?? new Date();

    const ageFromDob = dob ? calculateAge(dob, at) : undefined;
    const ageStored = getNumber((rec as any).age);

    return ageFromDob ?? ageStored;
  }, [patientQuery.data, visitCreatedAtDate]);

  const [lines, setLines] = useState<RxLineType[]>([]);
  const [toothDetails, setToothDetails] = useState<ToothDetail[]>([]);

  // ✅ printable notes (will print)
  const [doctorNotes, setDoctorNotes] = useState<string>('');

  // ✅ non-printable internal notes (doctor -> reception)
  const [doctorReceptionNotes, setDoctorReceptionNotes] = useState<string>('');

  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [, setActiveRxId] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  const lastHash = useRef<string>('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: !visitId });
  const [upsert] = useUpsertVisitRxMutation();

  const [startRevision, startRevisionMutationState] = useStartVisitRxRevisionMutation();

  const [isRevisionMode, setIsRevisionMode] = useState(false);
  const isDone = resolvedVisitStatus === 'DONE';
  const canEdit = !isDone || isRevisionMode;

  const setRevisionMode = (enabled: boolean) => {
    setIsRevisionMode(enabled);
    onRevisionModeChange?.(enabled);
  };

  const [importOpen, setImportOpen] = useState(false);

  const handleImportPreset = (presetLines: RxLineType[]) => {
    setLines((prev) => [...prev, ...presetLines]);
  };

  useEffect(() => {
    if (hydratedRef.current) return;
    if (!rxQuery.isSuccess) return;

    const rx = rxQuery.data?.rx ?? null;

    const rxRec: Record<string, unknown> = isRecord(rx) ? rx : {};
    const td = (rxRec as any).toothDetails;

    const dn = (rxRec as any).doctorNotes; // ✅ printable
    const drn = (rxRec as any).doctorReceptionNotes; // ✅ non-printable

    if (rx) {
      setLines((rx as any).lines ?? []);
      setToothDetails(Array.isArray(td) ? (td as ToothDetail[]) : []);
      setDoctorNotes(typeof dn === 'string' ? dn : '');
      setDoctorReceptionNotes(typeof drn === 'string' ? drn : '');
      setActiveRxId((rx as any).rxId);

      lastHash.current = JSON.stringify({
        lines: (rx as any).lines ?? [],
        toothDetails: Array.isArray(td) ? td : [],
        doctorNotes: typeof dn === 'string' ? dn : '',
        doctorReceptionNotes: typeof drn === 'string' ? drn : '',
      });
    } else {
      setLines([]);
      setToothDetails([]);
      setDoctorNotes('');
      setDoctorReceptionNotes('');
      setActiveRxId(null);

      lastHash.current = JSON.stringify({
        lines: [],
        toothDetails: [],
        doctorNotes: '',
        doctorReceptionNotes: '',
      });
    }

    hydratedRef.current = true;
    setState('idle');
  }, [rxQuery.isSuccess, rxQuery.data]);

  const hash = useMemo(
    () => JSON.stringify({ lines, toothDetails, doctorNotes, doctorReceptionNotes }),
    [lines, toothDetails, doctorNotes, doctorReceptionNotes],
  );

  // ✅ Treat either notes field as meaningful content for saving too
  const hasAnyRxData =
    lines.length > 0 ||
    toothDetails.length > 0 ||
    !!doctorNotes.trim() ||
    !!doctorReceptionNotes.trim();

  const canAutosave = canEdit && hydratedRef.current && hasAnyRxData && hash !== lastHash.current;

  useEffect(() => {
    if (!canAutosave) return;

    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setState('saving');
      try {
        const res = await upsert({
          visitId,
          lines,
          toothDetails,
          doctorNotes, // ✅ printable
          doctorReceptionNotes, // ✅ non-printable
        }).unwrap();
        setActiveRxId(res.rxId);

        lastHash.current = hash;
        setState('saved');
      } catch {
        setState('error');
      }
    }, 900);

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [
    canAutosave,
    hash,
    lines,
    toothDetails,
    doctorNotes,
    doctorReceptionNotes,
    visitId,
    upsert,
    canEdit,
    hasAnyRxData,
  ]);

  const statusText =
    state === 'saving'
      ? 'Saving…'
      : state === 'saved'
        ? 'Saved'
        : state === 'error'
          ? 'Save failed'
          : '';

  const showStartRevision = isDone && !isRevisionMode;

  const canManualSave = canEdit && hydratedRef.current && hasAnyRxData;

  const saveAndExit = async () => {
    if (!canManualSave) return;

    setState('saving');
    try {
      const res = await upsert({
        visitId,
        lines,
        toothDetails,
        doctorNotes, // ✅ printable
        doctorReceptionNotes, // ✅ non-printable
      }).unwrap();
      setActiveRxId(res.rxId);

      lastHash.current = hash;
      setState('saved');

      router.push(DASHBOARD_PATH);
    } catch {
      setState('error');
    }
  };

  // Used for printing chain metadata (PrescriptionPreview chain support)
  const visitsQuery = useGetPatientVisitsQuery(patientId ?? '', { skip: !patientId });
  const allVisitsRaw = (visitsQuery.data?.items ?? []) as Visit[];
  const currentVisit = visitQuery.data as Visit | undefined;

  const printChain = useMemo(() => {
    if (!patientId)
      return { visitIds: [visitId], meta: new Map<string, Visit>(), currentVisitId: visitId };

    const meta = new Map<string, Visit>();
    for (const v of allVisitsRaw) meta.set((v as any).visitId, v);
    if (currentVisit) meta.set((currentVisit as any).visitId, currentVisit);

    const curRec: Record<string, unknown> = isRecord(currentVisit)
      ? (currentVisit as unknown as Record<string, unknown>)
      : {};
    const tag = getString((curRec as any).tag);
    const anchorVisitId = getString((curRec as any).anchorVisitId);

    const anchorId = tag === 'F' ? anchorVisitId : visitId;

    if (!anchorId) {
      return { visitIds: [visitId], meta, currentVisitId: visitId };
    }

    const chain: Visit[] = [];

    const anchor = meta.get(anchorId);
    if (anchor) chain.push(anchor);

    for (const v of meta.values()) {
      const vRec: Record<string, unknown> = isRecord(v)
        ? (v as unknown as Record<string, unknown>)
        : {};
      const aId = getString((vRec as any).anchorVisitId);
      if (aId && aId === anchorId && (v as any).visitId !== anchorId) chain.push(v);
    }

    if (!chain.some((v) => (v as any).visitId === visitId)) {
      const cur = meta.get(visitId);
      if (cur) chain.push(cur);
      else chain.push({ visitId } as Visit);
    }

    chain.sort(
      (a, b) =>
        ((a as any).createdAt ?? (a as any).updatedAt ?? 0) -
        ((b as any).createdAt ?? (b as any).updatedAt ?? 0),
    );

    const seen = new Set<string>();
    const visitIds = chain
      .map((v) => (v as any).visitId as string)
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

    return { visitIds, meta, currentVisitId: visitId };
  }, [patientId, visitId, allVisitsRaw, currentVisit]);

  const [rxQuickOpen, setRxQuickOpen] = useState(false);
  const [xrayQuickOpen, setXrayQuickOpen] = useState(false);
  const [quickVisitId, setQuickVisitId] = useState<string | null>(null);

  const openRxQuick = (visitIdToOpen: string) => {
    setQuickVisitId(visitIdToOpen);
    setRxQuickOpen(true);
  };

  const openXrayQuick = (visitIdToOpen: string) => {
    setQuickVisitId(visitIdToOpen);
    setXrayQuickOpen(true);
  };

  const openVisitById = (vId: string) => {
    router.push(`/doctor/visits/${vId}`);
  };

  type PreviewProps = React.ComponentProps<typeof PrescriptionPreview>;

  return (
    <div className="relative w-full min-w-0">
      <div className="grid w-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-10">
        <div className="min-w-0 rounded-2xl bg-white p-4 lg:col-span-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-gray-900">Prescription</div>

            <div className="flex items-center gap-2">
              <div className="text-[11px] text-gray-500">{statusText}</div>

              {showStartRevision ? (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={startRevisionMutationState.isLoading}
                  onClick={async () => {
                    try {
                      const res = await startRevision({ visitId }).unwrap();
                      setActiveRxId(res.rxId);
                      setRevisionMode(true);
                      setState('idle');
                    } catch {
                      setState('error');
                    }
                  }}
                >
                  Start Revision
                </Button>
              ) : null}

              <Button
                variant="outline"
                className="rounded-xl cursor-pointer"
                onClick={saveAndExit}
                disabled={!canManualSave || state === 'saving'}
                title={
                  !canManualSave
                    ? 'Add medicines, tooth details, or notes to save'
                    : 'Save and return'
                }
              >
                Save
              </Button>
            </div>
          </div>

          <div className="mt-4 min-w-full overflow-x-hidden flex justify-center items-center">
            <PrescriptionPreview
              patientName={patientName}
              patientPhone={patientPhone}
              patientAge={patientAge}
              patientSex={patientSex}
              sdId={patientSdId}
              opdNo={opdNo}
              doctorName={resolvedDoctorName}
              doctorRegdLabel={resolvedDoctorRegdLabel}
              visitDateLabel={computedVisitDateLabel}
              regdDate={patientRegdDate} // ✅ NEW
              lines={lines as PreviewProps['lines']}
              doctorNotes={doctorNotes}
              currentVisitId={printChain.currentVisitId}
              chainVisitIds={printChain.visitIds}
              visitMetaMap={printChain.meta}
              toothDetails={toothDetails}
            />
          </div>

          {/* ✅ Printable doctor notes */}
          <div className="mt-4 rounded-2xl border bg-white p-4">
            <div className="text-base font-semibold text-gray-900">Doctor Notes (Printed)</div>
            <div className="mt-1 text-sm text-gray-500">
              This WILL print on the prescription under medicines.
            </div>

            <textarea
              className="mt-3 w-full min-h-22.5 rounded-2xl border bg-gray-50 p-3 text-sm outline-none focus:bg-white"
              placeholder="—"
              value={doctorNotes}
              onChange={(e) => setDoctorNotes(e.target.value)}
              disabled={!canEdit}
            />
          </div>

          {/* ✅ Non-printable doctor -> reception notes */}
          <div className="mt-4 rounded-2xl border bg-white p-4">
            <div className="text-base font-semibold text-gray-900">Doctor Reception Notes</div>
            <div className="mt-1 text-sm text-gray-500">
              Internal note from doctor for reception. This will NOT print.
            </div>

            <textarea
              className="mt-3 w-full min-h-22.5 rounded-2xl border bg-gray-50 p-3 text-sm outline-none focus:bg-white"
              placeholder="—"
              value={doctorReceptionNotes}
              onChange={(e) => setDoctorReceptionNotes(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        <Card className="w-full min-w-0 rounded-2xl border bg-white p-4 lg:col-span-6">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="text-lg font-semibold text-gray-900">Medicines</div>

            <div className="flex items-center gap-2">
              {canEdit ? <XrayUploader visitId={visitId} variant="outline" /> : null}

              <Button
                type="button"
                variant="outline"
                className="rounded-xl cursor-pointer"
                disabled={!canEdit}
                onClick={() => setImportOpen(true)}
              >
                Import Preset
              </Button>
            </div>
          </div>

          <div className="mt-3">
            {canEdit ? (
              <XrayGallery visitId={visitId} variant="embedded" canDelete />
            ) : (
              <XrayTrayReadOnly visitId={visitId} />
            )}
          </div>

          <div>
            <MultiToothDetailsEditor
              value={toothDetails}
              onChange={setToothDetails}
              disabled={!canEdit}
            />
          </div>

          <div className="min-w-0">
            {canEdit ? (
              <MedicinesEditor lines={lines} onChange={setLines} />
            ) : (
              <MedicinesReadOnly lines={lines} />
            )}
          </div>
        </Card>

        {/* ✅ Reuse shared Visit History component instead of duplicating table logic */}
        <div className="lg:col-span-10">
          {!patientId ? null : (
            <DoctorVisitHistoryPanel
              patientId={patientId}
              onOpenVisit={openVisitById}
              onOpenRxQuick={openRxQuick}
              onOpenXrayQuick={openXrayQuick}
            />
          )}
        </div>
      </div>

      <RxPresetImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        disabled={!canEdit}
        append
        existingCount={lines.length}
        onImport={(importedLines) => handleImportPreset(importedLines)}
      />

      <VisitPrescriptionQuickLookDialog
        open={rxQuickOpen}
        onOpenChange={(o) => setRxQuickOpen(o)}
        visitId={quickVisitId}
        patientId={patientId}
        patientName={patientName}
        patientPhone={patientPhone}
        patientSdId={patientSdId}
        opdNo={opdNo}
        doctorName={resolvedDoctorName}
        doctorRegdLabel={resolvedDoctorRegdLabel}
      />

      <VisitXrayQuickLookDialog
        open={xrayQuickOpen}
        onOpenChange={(o) => setXrayQuickOpen(o)}
        visitId={quickVisitId}
      />
    </div>
  );
}
