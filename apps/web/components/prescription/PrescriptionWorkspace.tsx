// apps/web/components/prescription/PrescriptionWorkspace.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RxLineType, Visit } from '@dms/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

import { motion } from 'framer-motion';
import { clinicDateISO } from '@/src/lib/clinicTime';
import { clinicDateISOFromMs } from '@/src/lib/clinicTime';

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

function toISODate(d: Date): string {
  return clinicDateISO(d);
}
function lineToText(line: RxLineType): string {
  const med = (line as any)?.medicineName ?? (line as any)?.medicine ?? 'Medicine';
  const dose = (line as any)?.dose ? `${(line as any).dose}` : '';
  const freq = (line as any)?.frequency ? `${(line as any).frequency}` : '';
  const days =
    (line as any)?.days !== undefined && (line as any)?.days !== null
      ? `${(line as any).days}`
      : '';
  const timing = (line as any)?.timing ? `${(line as any).timing}` : '';
  const notes = (line as any)?.notes ? `${(line as any).notes}` : '';

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
          {lines.map((l, idx) => (
            <TableRow key={(l as any)?.id ?? `${idx}`} className="hover:bg-gray-50/60">
              <TableCell className="w-[60px] text-gray-700">{idx + 1}</TableCell>
              <TableCell className="text-gray-800">{lineToText(l)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
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

/** If doctorName looks like "Doctor (uuid)" or raw uuid, treat it as not-a-name. */
function looksLikeDoctorIdLabel(name?: string) {
  if (!name) return true;
  const s = name.trim();
  if (!s) return true;

  if (/^Doctor\s*\(.+\)$/i.test(s)) return true;

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;

  return false;
}

/** ✅ Quick-look dialog for prescription */
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
    const createdAt = (visitQuery.data as any)?.createdAt;
    return safeParseDate(createdAt);
  }, [visitQuery.data]);

  const visitDateLabelComputed = useMemo(() => {
    const ms = visitCreatedAtDate?.getTime();
    return ms ? `Visit: ${clinicDateISOFromMs(ms)}` : '';
  }, [visitCreatedAtDate]);

  const patientSex = useMemo(() => {
    const p = patientQuery.data as any;
    const s = (p?.sex ?? p?.gender ?? p?.patientSex ?? '').toString().trim().toUpperCase();
    if (s === 'M' || s === 'F' || s === 'O' || s === 'U') return s as PatientSex;
    if (s === 'MALE') return 'M';
    if (s === 'FEMALE') return 'F';
    if (s === 'OTHER') return 'O';
    return undefined;
  }, [patientQuery.data]);

  const patientAge = useMemo(() => {
    const p = patientQuery.data as any;
    const dobRaw = p?.dob ?? p?.dateOfBirth ?? p?.birthDate ?? p?.dobIso ?? null;
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

/** ✅ Quick-look dialog for X-rays */
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

  // ✅ /me: doctor details
  const meQuery = useGetMeQuery();

  const doctorNameFromMe =
    meQuery.data?.doctorProfile?.fullName ?? meQuery.data?.displayName ?? undefined;

  const doctorRegdNoFromMe = meQuery.data?.doctorProfile?.registrationNumber;

  // ✅ Doctor name with loading placeholder behavior
  const resolvedDoctorName = useMemo(() => {
    if (doctorName && !looksLikeDoctorIdLabel(doctorName)) return doctorName;
    if (doctorNameFromMe && !looksLikeDoctorIdLabel(doctorNameFromMe)) return doctorNameFromMe;

    if (meQuery.isLoading || meQuery.isFetching) return undefined;
    return undefined;
  }, [doctorName, doctorNameFromMe, meQuery.isLoading, meQuery.isFetching]);

  // ✅ Doctor reg label with loading placeholder behavior
  const resolvedDoctorRegdLabel = useMemo(() => {
    if (doctorRegdNoFromMe) return `B.D.S Regd. - ${doctorRegdNoFromMe}`;

    if (meQuery.isLoading || meQuery.isFetching) return undefined;
    return undefined;
  }, [doctorRegdNoFromMe, meQuery.isLoading, meQuery.isFetching]);

  // ✅ Fetch visit + patient for createdAt + dob/sex
  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !patientId });

  const visitCreatedAtDate = useMemo(() => {
    const createdAt = (visitQuery.data as any)?.createdAt;
    return safeParseDate(createdAt);
  }, [visitQuery.data]);

  const computedVisitDateLabel = useMemo(() => {
    if (visitCreatedAtDate) return `Visit: ${toISODate(visitCreatedAtDate)}`;
    return visitDateLabelFromParent ?? '';
  }, [visitCreatedAtDate, visitDateLabelFromParent]);

  const patientSex = useMemo(() => {
    const p = patientQuery.data as any;
    const s = (p?.sex ?? p?.gender ?? p?.patientSex ?? '').toString().trim().toUpperCase();
    if (s === 'M' || s === 'F' || s === 'O' || s === 'U') return s as PatientSex;
    if (s === 'MALE') return 'M';
    if (s === 'FEMALE') return 'F';
    if (s === 'OTHER') return 'O';
    return undefined;
  }, [patientQuery.data]);

  const patientAge = useMemo(() => {
    const p = patientQuery.data as any;
    const dobRaw = p?.dob ?? p?.dateOfBirth ?? p?.birthDate ?? p?.dobIso ?? null;
    const dob = safeParseDate(dobRaw);
    const at = visitCreatedAtDate ?? new Date();
    if (!dob) return undefined;
    return calcAgeYears(dob, at);
  }, [patientQuery.data, visitCreatedAtDate]);

  // ---------------------------
  // Prescription editor state
  // ---------------------------
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

  // Revision mode
  const [isRevisionMode, setIsRevisionMode] = useState(false);
  const isDone = visitStatus === 'DONE';
  const canEdit = !isDone || isRevisionMode;

  const setRevisionMode = (enabled: boolean) => {
    setIsRevisionMode(enabled);
    onRevisionModeChange?.(enabled);
  };

  // ---------------------------
  // Rx Preset Import
  // ---------------------------
  const [importOpen, setImportOpen] = useState(false);

  const handleImportPreset = (presetLines: RxLineType[]) => {
    // ✅ append into existing list; editable immediately
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
          await updateRxById({ rxId: activeRxId!, lines }).unwrap();
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
      requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  // ---------------------------
  // Visits section
  // ---------------------------
  const visitsQuery = useGetPatientVisitsQuery(patientId ?? '', { skip: !patientId });
  const allVisitsRaw = visitsQuery.data?.items ?? [];

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

  const PAGE_SIZE = 2;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [selectedDateStr]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredVisits.slice(start, start + PAGE_SIZE);
  }, [filteredVisits, page]);

  const VIEW_ALL_PAGE_SIZE = 10;
  const [viewAllPage, setViewAllPage] = useState(1);

  const [visitsExpanded, setVisitsExpanded] = useState(false);

  useEffect(() => {
    if (visitsExpanded) setViewAllPage(1);
  }, [visitsExpanded, selectedDateStr]);

  const viewAllItems = useMemo(() => {
    const start = (viewAllPage - 1) * VIEW_ALL_PAGE_SIZE;
    return filteredVisits.slice(start, start + VIEW_ALL_PAGE_SIZE);
  }, [filteredVisits, viewAllPage]);

  const dateLabel = selectedDateStr ?? 'Pick a date';

  const openVisit = (v: Visit) => {
    router.push(`/doctor/visits/${v.visitId}`);
  };

  // Quick look (modal) state
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

  return (
    <div className="relative w-full min-w-0">
      <motion.div
        className="grid w-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-10"
        animate={
          visitsExpanded
            ? { opacity: 0.25, y: -6, filter: 'blur(1px)' as any }
            : { opacity: 1, y: 0, filter: 'blur(0px)' as any }
        }
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{ pointerEvents: visitsExpanded ? 'none' : 'auto' }}
      >
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

        {/* Bottom Visits section */}
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

            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setVisitsExpanded(true)}
              disabled={!patientId}
            >
              View All
            </Button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="font-semibold text-gray-600">Visit Date</TableHead>
                  <TableHead className="font-semibold text-gray-600">Reason</TableHead>
                  <TableHead className="font-semibold text-gray-600">Status</TableHead>
                  <TableHead className="text-right font-semibold text-gray-600">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {!patientId ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-gray-500">
                      Loading patient context…
                    </TableCell>
                  </TableRow>
                ) : visitsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-gray-500">
                      Loading visits…
                    </TableCell>
                  </TableRow>
                ) : pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-gray-500">
                      No visits found{selectedDateStr ? ` for ${selectedDateStr}` : ''}.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((v) => (
                    <TableRow key={v.visitId} className="hover:bg-gray-50/60">
                      <TableCell className="font-medium">{v.visitDate}</TableCell>
                      <TableCell className="text-gray-800">{v.reason ?? '—'}</TableCell>
                      <TableCell className="text-gray-800">{v.status ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-xl px-3 text-xs"
                            onClick={() => openRxQuick(v.visitId)}
                          >
                            View Prescription
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-xl px-3 text-xs"
                            onClick={() => openXrayQuick(v.visitId)}
                          >
                            View X-rays
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-xl px-3 text-xs"
                            onClick={() => openVisit(v)}
                          >
                            View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {filteredVisits.length > PAGE_SIZE ? (
              <div className="border-t bg-white px-3 py-2">
                <PaginationControl
                  page={page}
                  pageSize={PAGE_SIZE}
                  totalItems={filteredVisits.length}
                  onPageChange={setPage}
                />
              </div>
            ) : null}
          </div>
        </Card>
      </motion.div>

      {/* ✅ Rx Preset Import Dialog */}
      <RxPresetImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        disabled={!canEdit}
        append
        existingCount={lines.length}
        onImport={(importedLines) => handleImportPreset(importedLines)}
      />

      {/* Quick look dialogs */}
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
