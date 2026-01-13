'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import React from 'react';
import type { RxLineType, Visit } from '@dcm/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PrescriptionPreview } from './PrescriptionPreview';
import { MedicinesEditor } from './MedicinesEditor';
import { XrayUploader } from '@/components/xray/XrayUploader';
import { XrayGallery } from '@/components/xray/XrayGallery';
import { XrayTrayReadOnly } from '@/components/xray/XrayTrayReadOnly';

import {
  useUpsertVisitRxMutation,
  useGetVisitRxQuery,
  useStartVisitRxRevisionMutation,
  useGetPatientVisitsQuery,
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetMeQuery,
} from '@/src/store/api';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { RxPresetImportDialog } from './RxPresetImportDialog';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { PaginationControl } from '@/components/ui/pagination-control';

import { Calendar as CalendarIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { clinicDateISO, clinicDateISOFromMs, formatClinicDateShort } from '@/src/lib/clinicTime';
import type { ToothDetail } from '@dcm/types';
import { ToothDetailsEditor } from './ToothDetailsEditor';

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

function calcAgeYears(dob: Date, at: Date): number {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age -= 1;
  return age < 0 ? 0 : age;
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
  const allVisitsRaw = (visitsQuery.data?.items ?? []) as Visit[];

  const visitCreatedAtDate = useMemo(() => {
    const dUnknown: unknown = visitQuery.data;
    const createdAt = isRecord(dUnknown) ? dUnknown.createdAt : undefined;
    return safeParseDate(createdAt);
  }, [visitQuery.data]);

  const visitDateLabelComputed = useMemo(() => {
    const ms = visitCreatedAtDate?.getTime();
    return ms ? `Visit: ${clinicDateISOFromMs(ms)}` : '';
  }, [visitCreatedAtDate]);

  const patientSex = useMemo(() => {
    const pUnknown: unknown = patientQuery.data;
    const rec: Record<string, unknown> = isRecord(pUnknown) ? pUnknown : {};
    const raw = String(rec.sex ?? rec.gender ?? rec.patientSex ?? '')
      .trim()
      .toUpperCase();

    if (raw === 'M' || raw === 'F' || raw === 'O' || raw === 'U') return raw as PatientSex;
    if (raw === 'MALE') return 'M';
    if (raw === 'FEMALE') return 'F';
    if (raw === 'OTHER') return 'O';
    return undefined;
  }, [patientQuery.data]);

  const patientAge = useMemo(() => {
    const pUnknown: unknown = patientQuery.data;
    const rec: Record<string, unknown> = isRecord(pUnknown) ? pUnknown : {};
    const dobRaw = rec.dob ?? rec.dateOfBirth ?? rec.birthDate ?? rec.dobIso ?? null;

    const dob = safeParseDate(dobRaw);
    const at = visitCreatedAtDate ?? new Date();
    if (!dob) return undefined;
    return calcAgeYears(dob, at);
  }, [patientQuery.data, visitCreatedAtDate]);

  const currentLines = rxQuery.data?.rx?.lines ?? [];
  const currentToothDetails = useMemo<ToothDetail[]>(() => {
    const rUnknown: unknown = rxQuery.data?.rx;
    if (!rUnknown || !isRecord(rUnknown)) return [];
    const td = rUnknown.toothDetails;
    return Array.isArray(td) ? (td as ToothDetail[]) : [];
  }, [rxQuery.data]);

  const rxChain = useMemo(() => {
    const selectedId = visitId ?? '';
    const meta = new Map<string, Visit>();

    for (const v of allVisitsRaw) meta.set(v.visitId, v);

    const vqUnknown: unknown = visitQuery.data;
    if (isRecord(vqUnknown) && typeof vqUnknown.visitId === 'string') {
      meta.set(vqUnknown.visitId, vqUnknown as unknown as Visit);
    }

    const vSelected = meta.get(selectedId) ?? (vqUnknown as unknown as Visit | undefined);

    const selRec: Record<string, unknown> = isRecord(vSelected)
      ? (vSelected as unknown as Record<string, unknown>)
      : {};
    const tag = getString(selRec.tag);
    const anchorVisitId = getString(selRec.anchorVisitId);

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
      const aId = getString(vRec.anchorVisitId);
      if (aId && aId === anchorId && v.visitId !== anchorId) followups.push(v);
    }
    followups.sort((a, b) => (a.createdAt ?? a.updatedAt ?? 0) - (b.createdAt ?? b.updatedAt ?? 0));
    chain.push(...followups);

    if (selectedId && !chain.some((x) => x.visitId === selectedId)) {
      const cur = meta.get(selectedId);
      chain.push(cur ?? ({ visitId: selectedId } as Visit));
    }

    chain.sort((a, b) => (a.createdAt ?? a.updatedAt ?? 0) - (b.createdAt ?? b.updatedAt ?? 0));

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

  const selectedVisitOpdNo = useMemo(() => {
    const vUnknown: unknown = visitQuery.data;
    const v = isRecord(vUnknown) ? vUnknown : {};
    const raw = v.opdNo ?? v.opdNumber ?? v.opdId ?? v.opd ?? v.opd_no ?? v.opd_no_str ?? undefined;
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
              patientName={patientQuery.data?.name ?? patientName}
              patientPhone={patientQuery.data?.phone ?? patientPhone}
              patientAge={patientAge}
              patientSex={patientSex}
              sdId={patientQuery.data?.sdId ?? patientSdId}
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

function anchorIdFromVisit(v: Visit): string | undefined {
  const rec: Record<string, unknown> = isRecord(v) ? (v as unknown as Record<string, unknown>) : {};
  return getString(rec.anchorVisitId) ?? getString(rec.anchorId) ?? undefined;
}

function isZeroBilledVisit(v: Visit): boolean {
  const rec: Record<string, unknown> = isRecord(v) ? (v as unknown as Record<string, unknown>) : {};
  return Boolean(rec.zeroBilled);
}

function typeBadgeClass(kind: 'NEW' | 'FOLLOWUP') {
  if (kind === 'NEW') return 'bg-sky-100 text-sky-700 border-sky-200';
  return 'bg-violet-100 text-violet-700 border-violet-200';
}

function zeroBilledBadgeClass() {
  return 'bg-rose-100 text-rose-700 border-rose-200';
}

function stageLabel(status?: Visit['status']) {
  if (status === 'QUEUED') return 'Waiting';
  if (status === 'IN_PROGRESS') return 'In Progress';
  if (status === 'DONE') return 'Done';
  return '—';
}

function stageBadgeClass(status?: Visit['status']) {
  if (status === 'QUEUED') return 'bg-pink-100 text-pink-700 border-pink-200';
  if (status === 'IN_PROGRESS') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (status === 'DONE') return 'bg-green-100 text-green-700 border-green-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
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
    const createdAt = isRecord(vUnknown) ? vUnknown.createdAt : undefined;
    return safeParseDate(createdAt);
  }, [visitQuery.data]);

  const computedVisitDateLabel = useMemo(() => {
    if (visitCreatedAtDate) return `Visit: ${clinicDateISO(visitCreatedAtDate)}`;
    return visitDateLabelFromParent ?? '';
  }, [visitCreatedAtDate, visitDateLabelFromParent]);

  const patientSex = useMemo(() => {
    const pUnknown: unknown = patientQuery.data;
    const rec: Record<string, unknown> = isRecord(pUnknown) ? pUnknown : {};
    const raw = String(rec.sex ?? rec.gender ?? rec.patientSex ?? '')
      .trim()
      .toUpperCase();

    if (raw === 'M' || raw === 'F' || raw === 'O' || raw === 'U') return raw as PatientSex;
    if (raw === 'MALE') return 'M';
    if (raw === 'FEMALE') return 'F';
    if (raw === 'OTHER') return 'O';
    return undefined;
  }, [patientQuery.data]);

  const patientAge = useMemo(() => {
    const pUnknown: unknown = patientQuery.data;
    const rec: Record<string, unknown> = isRecord(pUnknown) ? pUnknown : {};
    const dobRaw = rec.dob ?? rec.dateOfBirth ?? rec.birthDate ?? rec.dobIso ?? null;

    const dob = safeParseDate(dobRaw);
    const at = visitCreatedAtDate ?? new Date();
    if (!dob) return undefined;
    return calcAgeYears(dob, at);
  }, [patientQuery.data, visitCreatedAtDate]);

  const [lines, setLines] = useState<RxLineType[]>([]);
  const [toothDetails, setToothDetails] = useState<ToothDetail[]>([]);

  const [doctorNotes, setDoctorNotes] = useState<string>('');

  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [, setActiveRxId] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  const lastHash = useRef<string>('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: !visitId });
  const [upsert] = useUpsertVisitRxMutation();
  const [startRevision, startRevisionState] = useStartVisitRxRevisionMutation();

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
    const td = rxRec.toothDetails;
    const dn = rxRec.doctorNotes;

    if (rx) {
      setLines(rx.lines ?? []);
      setToothDetails(Array.isArray(td) ? (td as ToothDetail[]) : []);
      setDoctorNotes(typeof dn === 'string' ? dn : '');
      setActiveRxId(rx.rxId);

      lastHash.current = JSON.stringify({
        lines: rx.lines ?? [],
        toothDetails: Array.isArray(td) ? td : [],
        doctorNotes: typeof dn === 'string' ? dn : '',
      });
    } else {
      setLines([]);
      setToothDetails([]);
      setDoctorNotes('');
      setActiveRxId(null);

      lastHash.current = JSON.stringify({ lines: [], toothDetails: [], doctorNotes: '' });
    }

    hydratedRef.current = true;
    setState('idle');
  }, [rxQuery.isSuccess, rxQuery.data]);

  const hash = useMemo(
    () => JSON.stringify({ lines, toothDetails, doctorNotes }),
    [lines, toothDetails, doctorNotes],
  );

  const hasAnyRxData = lines.length > 0 || toothDetails.length > 0;

  const canAutosave = canEdit && hydratedRef.current && hasAnyRxData && hash !== lastHash.current;

  useEffect(() => {
    if (!canAutosave) return;

    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setState('saving');
      try {
        const res = await upsert({ visitId, lines, toothDetails, doctorNotes }).unwrap();
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
  }, [canAutosave, hash, lines, toothDetails, doctorNotes, visitId, upsert]);

  const statusText =
    state === 'saving'
      ? 'Saving…'
      : state === 'saved'
        ? 'Saved'
        : state === 'error'
          ? 'Save failed'
          : '';

  const showStartRevision = isDone && !isRevisionMode;

  const canManualSave =
    canEdit && hydratedRef.current && (lines.length > 0 || toothDetails.length > 0);

  const saveAndExit = async () => {
    if (!canManualSave) return;

    setState('saving');
    try {
      const res = await upsert({ visitId, lines, toothDetails, doctorNotes }).unwrap();
      setActiveRxId(res.rxId);

      lastHash.current = hash;
      setState('saved');

      router.push(DASHBOARD_PATH);
    } catch {
      setState('error');
    }
  };

  const visitsQuery = useGetPatientVisitsQuery(patientId ?? '', { skip: !patientId });
  const allVisitsRaw = (visitsQuery.data?.items ?? []) as Visit[];

  const currentVisit = visitQuery.data as Visit | undefined;

  const printChain = useMemo(() => {
    if (!patientId)
      return { visitIds: [visitId], meta: new Map<string, Visit>(), currentVisitId: visitId };

    const meta = new Map<string, Visit>();

    for (const v of allVisitsRaw) meta.set(v.visitId, v);
    if (currentVisit) meta.set(currentVisit.visitId, currentVisit);

    const curRec: Record<string, unknown> = isRecord(currentVisit)
      ? (currentVisit as unknown as Record<string, unknown>)
      : {};
    const tag = getString(curRec.tag);
    const anchorVisitId = getString(curRec.anchorVisitId);

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
      const aId = getString(vRec.anchorVisitId);
      if (aId && aId === anchorId && v.visitId !== anchorId) chain.push(v);
    }

    if (!chain.some((v) => v.visitId === visitId)) {
      const cur = meta.get(visitId);
      if (cur) chain.push(cur);
      else chain.push({ visitId } as Visit);
    }

    chain.sort((a, b) => (a.createdAt ?? a.updatedAt ?? 0) - (b.createdAt ?? b.updatedAt ?? 0));

    const seen = new Set<string>();
    const visitIds = chain
      .map((v) => v.visitId)
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

    return { visitIds, meta, currentVisitId: visitId };
  }, [patientId, visitId, allVisitsRaw, currentVisit]);

  const allVisits = useMemo(() => {
    return [...allVisitsRaw]
      .filter((v) => v.status === 'DONE')
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));
  }, [allVisitsRaw]);

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const selectedDateStr = useMemo(
    () => (selectedDate ? clinicDateISO(selectedDate) : null),
    [selectedDate],
  );

  const filteredVisits = useMemo(() => {
    if (!selectedDateStr) return allVisits;
    return allVisits.filter((v) => v.visitDate === selectedDateStr);
  }, [allVisits, selectedDateStr]);

  const visitById = useMemo(() => {
    const map = new Map<string, Visit>();
    for (const v of allVisits) map.set(v.visitId, v);
    return map;
  }, [allVisits]);

  const groups = useMemo(() => {
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
      g.followups.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    }

    const anchorsOrdered = Array.from(anchorMap.values()).sort(
      (a, b) =>
        (b.anchor.updatedAt ?? b.anchor.createdAt ?? 0) -
        (a.anchor.updatedAt ?? a.anchor.createdAt ?? 0),
    );

    const orphanGroups = orphanFollowups
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))
      .map((followup) => ({ followup }));

    return { anchorsOrdered, orphanGroups };
  }, [filteredVisits, visitById]);

  const PAGE_SIZE = 2;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [selectedDateStr, allVisitsRaw]);

  const totalAnchorPages = Math.max(1, Math.ceil(groups.anchorsOrdered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalAnchorPages);

  const pageAnchors = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return groups.anchorsOrdered.slice(start, start + PAGE_SIZE);
  }, [groups.anchorsOrdered, pageSafe]);

  const dateLabel = selectedDateStr ?? 'Pick a date';

  const openVisit = (v: Visit) => {
    router.push(`/doctor/visits/${v.visitId}`);
  };

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

  const renderReasonCell = (visit: Visit, opts: { kind: 'NEW' | 'FOLLOWUP'; anchor?: Visit }) => {
    let followupCount = 0;
    if (opts.kind === 'NEW') {
      const anchorId = visit.visitId;
      for (const v of allVisits) {
        if (anchorIdFromVisit(v) === anchorId) followupCount += 1;
      }
    }

    const followupOfText =
      opts.kind === 'FOLLOWUP'
        ? (() => {
            const a =
              opts.anchor ??
              (anchorIdFromVisit(visit) ? visitById.get(anchorIdFromVisit(visit)!) : undefined);

            const aReason = (a?.reason || '—').toString();
            const aDate = a?.visitDate ? formatClinicDateShort(a.visitDate) : '—';
            return `Follow-up of: ${aReason} • ${aDate}`;
          })()
        : null;

    return (
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-gray-900">
          {visit.reason?.trim() ? visit.reason : '—'}
        </div>

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
                  disabled={startRevisionState.isLoading}
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
                className="rounded-xl"
                onClick={saveAndExit}
                disabled={!canManualSave || state === 'saving'}
                title={
                  !canManualSave
                    ? 'Add medicines or tooth details to save'
                    : 'Save prescription and return'
                }
              >
                Save
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-4 ">
            <div className="text-base font-semibold text-gray-900">Doctor Notes</div>
            <div className="mt-1 text-sm text-gray-500">
              Internal note from doctor for reception. This will NOT print.
            </div>

            <textarea
              className="mt-3 w-full min-h-[90px] rounded-2xl border bg-gray-50 p-3 text-sm outline-none focus:bg-white"
              placeholder="—"
              value={doctorNotes}
              onChange={(e) => setDoctorNotes(e.target.value)}
              disabled={!canEdit}
            />
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
              lines={lines as PreviewProps['lines']}
              currentVisitId={printChain.currentVisitId}
              chainVisitIds={printChain.visitIds}
              visitMetaMap={printChain.meta}
              toothDetails={toothDetails}
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
                className="rounded-xl"
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

          <div className="mt-4">
            <ToothDetailsEditor
              value={toothDetails}
              onChange={setToothDetails}
              disabled={!canEdit}
            />
          </div>

          <div className="mt-4 min-w-0">
            {canEdit ? (
              <MedicinesEditor lines={lines} onChange={setLines} />
            ) : (
              <MedicinesReadOnly lines={lines} />
            )}
          </div>
        </Card>

        <Card className="w-full rounded-2xl border bg-white p-4 lg:col-span-10">
          <div className="flex items-center justify-between gap-3">
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
                  <TableHead className="text-right font-semibold text-gray-600">Actions</TableHead>
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
                              {formatClinicDateShort(anchor.visitDate)}
                            </TableCell>

                            <TableCell className="px-6 py-4 align-top">
                              {renderReasonCell(anchor, { kind: 'NEW' })}
                            </TableCell>

                            <TableCell className="px-6 py-4 align-top">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={`rounded-full px-4 py-1 text-[11px] font-semibold ${typeBadgeClass('NEW')}`}
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
                              </div>
                            </TableCell>

                            <TableCell className="px-6 py-4 align-top">
                              <Badge
                                variant="outline"
                                className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(anchor.status)}`}
                              >
                                {stageLabel(anchor.status)}
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
                                  <div className="ml-1 h-7 w-0.5 rounded-full bg-gray-200" />
                                  <div className="text-sm text-gray-900">
                                    {formatClinicDateShort(f.visitDate)}
                                  </div>
                                </div>
                              </TableCell>

                              <TableCell className="px-6 py-2 align-top">
                                <div className="flex items-start gap-3">
                                  <div className="ml-1 h-7 w-0.5 rounded-full bg-gray-200" />
                                  <div className="min-w-0 flex-1">
                                    {renderReasonCell(f, { kind: 'FOLLOWUP', anchor })}
                                  </div>
                                </div>
                              </TableCell>

                              <TableCell className="px-6 py-2 align-top">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`rounded-full px-4 py-1 text-[11px] font-semibold ${typeBadgeClass('FOLLOWUP')}`}
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
                                </div>
                              </TableCell>

                              <TableCell className="px-6 py-2 align-top">
                                <Badge
                                  variant="outline"
                                  className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(f.status)}`}
                                >
                                  {stageLabel(f.status)}
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

                    {groups.orphanGroups.length
                      ? groups.orphanGroups.map(({ followup }) => {
                          const aId = anchorIdFromVisit(followup);
                          const a = aId ? visitById.get(aId) : undefined;

                          return (
                            <TableRow key={followup.visitId} className="hover:bg-gray-50/60">
                              <TableCell className="px-6 py-3 align-top text-sm text-gray-900">
                                {formatClinicDateShort(followup.visitDate)}
                              </TableCell>

                              <TableCell className="px-6 py-3 align-top">
                                {renderReasonCell(followup, { kind: 'FOLLOWUP', anchor: a })}
                              </TableCell>

                              <TableCell className="px-6 py-3 align-top">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`rounded-full px-4 py-1 text-[11px] font-semibold ${typeBadgeClass('FOLLOWUP')}`}
                                  >
                                    FOLLOW UP
                                  </Badge>

                                  {isZeroBilledVisit(followup) ? (
                                    <Badge
                                      variant="outline"
                                      className={`rounded-full px-4 py-1 text-[11px] font-semibold ${zeroBilledBadgeClass()}`}
                                    >
                                      ZERO BILLED
                                    </Badge>
                                  ) : null}
                                </div>
                              </TableCell>

                              <TableCell className="px-6 py-3 align-top">
                                <Badge
                                  variant="outline"
                                  className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(followup.status)}`}
                                >
                                  {stageLabel(followup.status)}
                                </Badge>
                              </TableCell>

                              <TableCell className="px-6 py-3 align-top text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 rounded-xl px-3 text-xs"
                                    onClick={() => openRxQuick(followup.visitId)}
                                  >
                                    View Rx
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 rounded-xl px-3 text-xs"
                                    onClick={() => openXrayQuick(followup.visitId)}
                                  >
                                    X-rays
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 rounded-xl px-3 text-xs"
                                    onClick={() => openVisit(followup)}
                                  >
                                    View
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      : null}
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
