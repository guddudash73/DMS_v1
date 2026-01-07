'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import React from 'react';
import type { RxLineType, Visit } from '@dms/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PrescriptionPreview } from './PrescriptionPreview';
import { PrescriptionPrintSheet } from './PrescriptionPrintSheet';
import { MedicinesEditor } from './MedicinesEditor';
import { XrayUploader } from '@/components/xray/XrayUploader';
import { XrayGallery } from '@/components/xray/XrayGallery';
import { XrayTrayReadOnly } from '@/components/xray/XrayTrayReadOnly';

import {
  useUpsertVisitRxMutation,
  useGetVisitRxQuery,
  useStartVisitRxRevisionMutation,
  useUpdateRxByIdMutation,
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
  const rec: Record<string, unknown> = isRecord(line) ? line : {};

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
            const rec: Record<string, unknown> = isRecord(l) ? l : {};
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
  const lines = rxQuery.data?.rx?.lines ?? [];

  const visitQuery = useGetVisitByIdQuery(visitId ?? '', { skip: !open || !visitId });
  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !open || !patientId });

  const visitCreatedAtDate = useMemo(() => {
    const createdAt = isRecord(visitQuery.data) ? (visitQuery.data as any).createdAt : undefined;
    return safeParseDate(createdAt);
  }, [visitQuery.data]);

  const visitDateLabelComputed = useMemo(() => {
    const ms = visitCreatedAtDate?.getTime();
    return ms ? `Visit: ${clinicDateISOFromMs(ms)}` : '';
  }, [visitCreatedAtDate]);

  const patientSex = useMemo(() => {
    const p = patientQuery.data;
    const rec: Record<string, unknown> = isRecord(p) ? p : {};
    const raw = (rec.sex ?? rec.gender ?? rec.patientSex ?? '').toString().trim().toUpperCase();
    if (raw === 'M' || raw === 'F' || raw === 'O' || raw === 'U') return raw as PatientSex;
    if (raw === 'MALE') return 'M';
    if (raw === 'FEMALE') return 'F';
    if (raw === 'OTHER') return 'O';
    return undefined;
  }, [patientQuery.data]);

  const patientAge = useMemo(() => {
    const p = patientQuery.data;
    const rec: Record<string, unknown> = isRecord(p) ? p : {};
    const dobRaw = rec.dob ?? rec.dateOfBirth ?? rec.birthDate ?? rec.dobIso ?? null;

    const dob = safeParseDate(dobRaw);
    const at = visitCreatedAtDate ?? new Date();
    if (!dob) return undefined;
    return calcAgeYears(dob, at);
  }, [patientQuery.data, visitCreatedAtDate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>Prescription</DialogTitle>
        </DialogHeader>

        <div className="min-w-0 overflow-x-hidden rounded-2xl border bg-white p-4">
          {rxQuery.isFetching ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : !rxQuery.data?.rx ? (
            <div className="text-sm text-gray-500">No prescription found for this visit.</div>
          ) : (
            <PrescriptionPreview
              patientName={patientName}
              patientPhone={patientPhone}
              patientAge={patientAge}
              patientSex={patientSex}
              sdId={patientSdId}
              opdNo={opdNo}
              doctorName={doctorName}
              doctorRegdLabel={doctorRegdLabel}
              visitDateLabel={visitDateLabelComputed}
              lines={lines}
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
  const anyV = v as any;
  const raw =
    (typeof anyV?.anchorVisitId === 'string' && anyV.anchorVisitId) ||
    (typeof anyV?.anchorId === 'string' && anyV.anchorId) ||
    undefined;
  return raw || undefined;
}

function isZeroBilledVisit(v: Visit): boolean {
  const anyV = v as any;
  return Boolean(anyV?.zeroBilled);
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
    visitStatus,
    onRevisionModeChange,
  } = props;

  const router = useRouter();

  // /me: doctor details
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

  // Fetch visit + patient for createdAt + dob/sex
  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !patientId });

  const visitCreatedAtDate = useMemo(() => {
    const createdAt = isRecord(visitQuery.data) ? (visitQuery.data as any).createdAt : undefined;
    return safeParseDate(createdAt);
  }, [visitQuery.data]);

  const computedVisitDateLabel = useMemo(() => {
    if (visitCreatedAtDate) return `Visit: ${clinicDateISO(visitCreatedAtDate)}`;
    return visitDateLabelFromParent ?? '';
  }, [visitCreatedAtDate, visitDateLabelFromParent]);

  const patientSex = useMemo(() => {
    const p = patientQuery.data;
    const rec: Record<string, unknown> = isRecord(p) ? p : {};
    const raw = (rec.sex ?? rec.gender ?? rec.patientSex ?? '').toString().trim().toUpperCase();
    if (raw === 'M' || raw === 'F' || raw === 'O' || raw === 'U') return raw as PatientSex;
    if (raw === 'MALE') return 'M';
    if (raw === 'FEMALE') return 'F';
    if (raw === 'OTHER') return 'O';
    return undefined;
  }, [patientQuery.data]);

  const patientAge = useMemo(() => {
    const p = patientQuery.data;
    const rec: Record<string, unknown> = isRecord(p) ? p : {};
    const dobRaw = rec.dob ?? rec.dateOfBirth ?? rec.birthDate ?? rec.dobIso ?? null;

    const dob = safeParseDate(dobRaw);
    const at = visitCreatedAtDate ?? new Date();
    if (!dob) return undefined;
    return calcAgeYears(dob, at);
  }, [patientQuery.data, visitCreatedAtDate]);

  // Prescription editor state
  const [lines, setLines] = useState<RxLineType[]>([]);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [activeRxId, setActiveRxId] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  const lastHash = useRef<string>('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: !visitId });
  const [upsert] = useUpsertVisitRxMutation();
  const [startRevision, startRevisionState] = useStartVisitRxRevisionMutation();
  const [updateRxById] = useUpdateRxByIdMutation();

  const [isRevisionMode, setIsRevisionMode] = useState(false);
  const isDone = visitStatus === 'DONE';
  const canEdit = !isDone || isRevisionMode;

  const setRevisionMode = (enabled: boolean) => {
    setIsRevisionMode(enabled);
    onRevisionModeChange?.(enabled);
  };

  // Rx Preset Import
  const [importOpen, setImportOpen] = useState(false);

  const handleImportPreset = (presetLines: RxLineType[]) => {
    setLines((prev) => [...prev, ...presetLines]);
  };

  // Hydrate once
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!rxQuery.isSuccess) return;

    const rx = rxQuery.data?.rx ?? null;
    if (rx) {
      setLines(rx.lines ?? []);
      setActiveRxId(rx.rxId);
      lastHash.current = JSON.stringify(rx.lines ?? []);
    } else {
      setLines([]);
      setActiveRxId(null);
      lastHash.current = JSON.stringify([]);
    }

    hydratedRef.current = true;
    setState('idle');
  }, [rxQuery.isSuccess, rxQuery.data]);

  const hash = useMemo(() => JSON.stringify(lines), [lines]);

  const canAutosave =
    canEdit &&
    hydratedRef.current &&
    lines.length > 0 &&
    hash !== lastHash.current &&
    (visitStatus !== 'DONE' || !!activeRxId);

  useEffect(() => {
    if (!canAutosave) return;

    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setState('saving');
      try {
        if (visitStatus === 'DONE') {
          if (!activeRxId) {
            setState('error');
            return;
          }
          await updateRxById({ rxId: activeRxId, lines }).unwrap();
        } else {
          const res = await upsert({ visitId, lines }).unwrap();
          setActiveRxId(res.rxId);
        }

        lastHash.current = hash;
        setState('saved');
      } catch {
        setState('error');
      }
    }, 900);

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [canAutosave, hash, lines, visitId, visitStatus, activeRxId, upsert, updateRxById, canEdit]);

  const statusText =
    state === 'saving'
      ? 'Saving…'
      : state === 'saved'
        ? 'Saved'
        : state === 'error'
          ? 'Save failed'
          : '';

  const showStartRevision = isDone && !isRevisionMode;
  const canPrint = lines.length > 0;

  const printPrescription = () => {
    if (!canPrint) return;

    const onAfterPrint = () => {
      document.body.classList.remove('print-rx');
      window.removeEventListener('afterprint', onAfterPrint);
    };

    window.addEventListener('afterprint', onAfterPrint);
    document.body.classList.add('print-rx');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  const canManualSave = canEdit && hydratedRef.current && lines.length > 0;

  const saveAndExit = async () => {
    if (!canManualSave) return;

    setState('saving');
    try {
      if (visitStatus === 'DONE') {
        if (!activeRxId) throw new Error('Missing rxId');
        await updateRxById({ rxId: activeRxId, lines }).unwrap();
      } else {
        const res = await upsert({ visitId, lines }).unwrap();
        setActiveRxId(res.rxId);
      }

      lastHash.current = JSON.stringify(lines);
      setState('saved');

      router.push(DASHBOARD_PATH);
    } catch {
      setState('error');
    }
  };

  // Visits (bottom)
  const visitsQuery = useGetPatientVisitsQuery(patientId ?? '', { skip: !patientId });
  const allVisitsRaw = (visitsQuery.data?.items ?? []) as Visit[];

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
  }, [filteredVisits]);

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

  return (
    <div className="relative w-full min-w-0">
      <div className="grid w-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-10">
        {/* Prescription */}
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
                title={!canManualSave ? 'Add medicines to save' : 'Save prescription and return'}
              >
                Save
              </Button>

              <Button
                variant="default"
                className="cursor-pointer rounded-xl"
                onClick={printPrescription}
                disabled={!canPrint}
                title={!canPrint ? 'No medicines to print' : 'Print prescription'}
              >
                Print
              </Button>
            </div>
          </div>

          <div className="mt-3 min-w-0 overflow-x-hidden">
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
              lines={lines}
            />
          </div>

          <PrescriptionPrintSheet
            patientName={patientName}
            patientPhone={patientPhone}
            patientAge={patientAge}
            patientSex={patientSex}
            sdId={patientSdId}
            opdNo={opdNo}
            doctorName={resolvedDoctorName}
            doctorRegdLabel={resolvedDoctorRegdLabel}
            visitDateLabel={computedVisitDateLabel}
            lines={lines}
          />
        </div>

        {/* Medicines */}
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

          <div className="mt-4 min-w-0">
            {canEdit ? (
              <MedicinesEditor lines={lines} onChange={setLines} />
            ) : (
              <MedicinesReadOnly lines={lines} />
            )}
          </div>
        </Card>

        {/* Bottom Visits section (NO View All button anymore) */}
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
                              </div>
                            </TableCell>

                            <TableCell className="px-6 py-4 align-top">
                              <Badge
                                variant="outline"
                                className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(
                                  anchor.status,
                                )}`}
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
                                  <div className="ml-1 h-7 w-[2px] rounded-full bg-gray-200" />
                                  <div className="text-sm text-gray-900">
                                    {formatClinicDateShort(f.visitDate)}
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
                                </div>
                              </TableCell>

                              <TableCell className="px-6 py-2 align-top">
                                <Badge
                                  variant="outline"
                                  className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(
                                    f.status,
                                  )}`}
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
                                    className={`rounded-full px-4 py-1 text-[11px] font-semibold ${typeBadgeClass(
                                      'FOLLOWUP',
                                    )}`}
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
                                  className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(
                                    followup.status,
                                  )}`}
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
