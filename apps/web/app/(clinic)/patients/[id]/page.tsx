// apps/web/app/(clinic)/patients/[id]/page.tsx
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

import type { PatientId, Visit } from '@dcm/types';
import {
  useGetPatientByIdQuery,
  useGetPatientVisitsQuery,
  useGetDoctorsQuery,
  useGetPatientSummaryQuery,
  useGetMeQuery,
  useAvoidPatientMutation,
  useUnavoidPatientMutation,
  type ErrorResponse,
} from '@/src/store/api';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import RegisterVisitModal from '@/components/visits/RegisterVisitModal';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

import { ArrowRight, Calendar as CalendarIcon } from 'lucide-react';
import { clinicDateISO, formatClinicDateShort } from '@/src/lib/clinicTime';
import EditPatientModal from '@/components/patients/EditPatientModal';

type ApiError = {
  status?: number;
  data?: unknown;
};

type PatientSex = 'M' | 'F' | 'O' | 'U';

const asErrorResponse = (data: unknown): ErrorResponse | null => {
  if (!data || typeof data !== 'object') return null;
  const maybe = data as Partial<ErrorResponse>;
  if (typeof maybe.error === 'string') {
    return {
      error: maybe.error,
      message: typeof maybe.message === 'string' ? maybe.message : undefined,
      fieldErrors:
        maybe.fieldErrors && typeof maybe.fieldErrors === 'object'
          ? (maybe.fieldErrors as Record<string, string[]>)
          : undefined,
      traceId: typeof maybe.traceId === 'string' ? maybe.traceId : undefined,
    };
  }
  return null;
};

const formatVisitDate = (dateStr: string) => formatClinicDateShort(dateStr);

const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function safeParseDobToDate(dob?: string): Date | null {
  if (!dob) return null;
  const s = dob.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  const d = new Date(y, mo, da);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calculateAge(dob: Date, at: Date): number {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age -= 1;
  return age < 0 ? 0 : age;
}

function genderLabel(raw?: string): string {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (s === 'MALE') return 'Male';
  if (s === 'FEMALE') return 'Female';
  if (s === 'OTHER') return 'Other';
  if (s === 'UNKNOWN') return 'Unknown';
  return '—';
}

function SimplePagination(props: {
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
}) {
  const { page, totalPages, onPageChange } = props;

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-9 rounded-xl px-3 text-xs"
        disabled={!canPrev}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>

      <div className="px-2 text-xs text-gray-600">
        Page <span className="font-semibold text-gray-900">{page}</span> of{' '}
        <span className="font-semibold text-gray-900">{totalPages}</span>
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-9 rounded-xl px-3 text-xs"
        disabled={!canNext}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function anchorIdFromVisit(v: Visit): string | undefined {
  const rec: Record<string, unknown> = isRecord(v) ? (v as Record<string, unknown>) : {};
  const a1 = rec['anchorVisitId'];
  const a2 = rec['anchorId'];

  const raw = (typeof a1 === 'string' && a1) || (typeof a2 === 'string' && a2) || undefined;

  return raw || undefined;
}

function isZeroBilledVisit(v: Visit): boolean {
  const rec: Record<string, unknown> = isRecord(v) ? (v as Record<string, unknown>) : {};
  return Boolean(rec['zeroBilled']);
}

function typeBadgeClass(kind: 'NEW' | 'FOLLOWUP') {
  if (kind === 'NEW') return 'bg-sky-100 text-sky-700 border-sky-200';
  return 'bg-violet-100 text-violet-700 border-violet-200';
}

function zeroBilledBadgeClass() {
  return 'bg-rose-100 text-rose-700 border-rose-200';
}

function isAvoidedFlag(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value['isAvoided'] === true;
}

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const rawId = params?.id;
  const router = useRouter();

  const [registerOpen, setRegisterOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);

  if (!rawId || typeof rawId !== 'string') {
    return (
      <section className="p-6">
        <p className="text-sm text-red-600">Invalid patient id in URL.</p>
      </section>
    );
  }

  const patientId = rawId as PatientId;

  const {
    data: patient,
    isLoading: patientLoading,
    error: rawPatientError,
  } = useGetPatientByIdQuery(patientId);

  const {
    data: visitsData,
    isLoading: visitsLoading,
    error: rawVisitsError,
  } = useGetPatientVisitsQuery(patientId);

  const { data: summary } = useGetPatientSummaryQuery(patientId);

  useGetDoctorsQuery();

  const meQuery = useGetMeQuery();
  const me = meQuery.data ?? null;

  const [selectedDate, setSelectedDate] = React.useState<string>('');
  const selectedDateObj = React.useMemo(() => {
    if (!selectedDate) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return undefined;
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? undefined : dt;
  }, [selectedDate]);

  const [datePopoverOpen, setDatePopoverOpen] = React.useState(false);

  const patientErrorMessage = React.useMemo(() => {
    if (!rawPatientError) return null;
    const e = rawPatientError as ApiError;
    const maybe = asErrorResponse(e.data);
    return maybe?.message ?? 'Unable to load patient.';
  }, [rawPatientError]);

  const visitsErrorMessage = React.useMemo(() => {
    if (!rawVisitsError) return null;
    const e = rawVisitsError as ApiError;
    const maybe = asErrorResponse(e.data);
    return maybe?.message ?? 'Unable to load visits.';
  }, [rawVisitsError]);

  const visits: Visit[] = visitsData?.items ?? [];

  const sortedVisits = React.useMemo(() => {
    const items = [...visits];
    items.sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));
    return items;
  }, [visits]);

  const filteredVisits = React.useMemo(() => {
    if (!selectedDate) return sortedVisits;
    return sortedVisits.filter((v) => v.visitDate === selectedDate);
  }, [sortedVisits, selectedDate]);

  const visitById = React.useMemo(() => {
    const map = new Map<string, Visit>();
    for (const v of sortedVisits) map.set(v.visitId, v);
    return map;
  }, [sortedVisits]);

  const groups = React.useMemo(() => {
    type Group = {
      anchor: Visit;
      followups: Visit[];
    };

    const anchorMap = new Map<string, Group>();
    const orphanFollowups: Visit[] = [];

    for (const v of filteredVisits) {
      const anchorId = anchorIdFromVisit(v);
      if (!anchorId) {
        anchorMap.set(v.visitId, { anchor: v, followups: [] });
      }
    }

    for (const v of filteredVisits) {
      const anchorId = anchorIdFromVisit(v);
      if (!anchorId) continue;

      const g = anchorMap.get(anchorId);
      if (g) {
        g.followups.push(v);
      } else {
        orphanFollowups.push(v);
      }
    }

    for (const g of anchorMap.values()) {
      g.followups.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    }

    const anchorsOrdered: Group[] = Array.from(anchorMap.values()).sort(
      (a, b) =>
        (b.anchor.updatedAt ?? b.anchor.createdAt ?? 0) -
        (a.anchor.updatedAt ?? a.anchor.createdAt ?? 0),
    );

    const orphanGroups: Array<{ followup: Visit }> = orphanFollowups
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))
      .map((f) => ({ followup: f }));

    return { anchorsOrdered, orphanGroups };
  }, [filteredVisits, visitById]);

  const followupLabel = summary?.nextFollowUpDate ?? 'No Follow Up Scheduled';

  const patientAgeLabel = React.useMemo(() => {
    if (!patient) return '—';

    const dobDate = safeParseDobToDate(patient.dob);
    if (dobDate) {
      const age = calculateAge(dobDate, new Date());
      return Number.isFinite(age) ? String(age) : '—';
    }

    if (typeof patient.age === 'number' && Number.isFinite(patient.age)) {
      return String(patient.age);
    }

    return '—';
  }, [patient]);

  const PAGE_SIZE = 4;
  const [page, setPage] = React.useState<number>(1);

  React.useEffect(() => {
    setPage(1);
  }, [selectedDate, visitsData?.items]);

  const totalAnchorPages = Math.max(1, Math.ceil(groups.anchorsOrdered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalAnchorPages);

  const pageAnchors = React.useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return groups.anchorsOrdered.slice(start, start + PAGE_SIZE);
  }, [groups.anchorsOrdered, pageSafe]);

  const renderReasonCell = (visit: Visit, opts: { kind: 'NEW' | 'FOLLOWUP'; anchor?: Visit }) => {
    const anchor = opts.anchor;

    let followupCount = 0;
    if (opts.kind === 'NEW') {
      const anchorId = visit.visitId;
      for (const v of sortedVisits) {
        if (anchorIdFromVisit(v) === anchorId) followupCount += 1;
      }
    }

    const followupOfText =
      opts.kind === 'FOLLOWUP'
        ? (() => {
            const a =
              anchor ??
              (anchorIdFromVisit(visit) ? visitById.get(anchorIdFromVisit(visit)!) : undefined);
            const aReason = (a?.reason || '—').toString();
            const aDate = a?.visitDate ? formatVisitDate(a.visitDate) : '—';
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

  const [avoidPatient, { isLoading: avoidLoading }] = useAvoidPatientMutation();
  const [unavoidPatient, { isLoading: unavoidLoading }] = useUnavoidPatientMutation();

  const isAvoided = isAvoidedFlag(patient);

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10 w-full">
      <div className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-end gap-6">
          <div className="text-sm">
            <span className="font-medium text-gray-700">Follow up:&nbsp;</span>
            <span
              className={[
                'font-semibold',
                summary?.nextFollowUpDate ? 'text-green-600' : 'text-red-500',
              ].join(' ')}
            >
              {followupLabel}
            </span>
          </div>
        </div>

        <Card className="rounded-2xl border-none bg-white px-8 py-6 shadow-sm w-full">
          <div className="flex gap-4">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Patient Details:</h2>
            {patient && isAvoided ? (
              <div className="mb-3 inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700">
                AVOID PATIENT
              </div>
            ) : null}
          </div>

          {patientLoading && (
            <div className="space-y-2 text-sm text-gray-600" aria-busy="true">
              <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
            </div>
          )}

          {!patientLoading && patientErrorMessage && (
            <p className="text-sm text-red-600">{patientErrorMessage}</p>
          )}

          {!patientLoading && !patientErrorMessage && patient && (
            <div className="grid gap-4 text-sm text-gray-800 md:grid-cols-2">
              <dl className="space-y-2">
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-gray-600">Name</dt>
                  <dd className="text-gray-900">: {patient.name}</dd>
                </div>

                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-gray-600">Age/Sex</dt>
                  <dd className="text-gray-900">
                    : {patientAgeLabel} / {genderLabel(patient.gender)}
                  </dd>
                </div>

                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-gray-600">Contact No.</dt>
                  <dd className="text-gray-900">: {patient.phone ?? '—'}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-gray-600">Address</dt>
                  <dd className="whitespace-pre-line text-gray-900">: {patient.address ?? '—'}</dd>
                </div>
              </dl>

              <dl className="space-y-2 md:justify-self-end">
                <div className="flex gap-3">
                  <dt className="w-32 shrink-0 text-gray-600">Regd. Date</dt>
                  <dd className="text-gray-900">
                    :{' '}
                    {patient.createdAt
                      ? new Date(patient.createdAt).toLocaleDateString('en-GB')
                      : '—'}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-32 shrink-0 text-gray-600">SD-ID</dt>
                  <dd className="text-gray-900">: {patient.sdId}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-32 shrink-0 text-gray-600">Visits count</dt>
                  <dd className="text-gray-900">: {summary?.doneVisitCount ?? 0}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-32 shrink-0 text-gray-600">Last Visit</dt>
                  <dd className="text-gray-900">: {summary?.lastVisitDate ?? '—'}</dd>
                </div>
              </dl>
            </div>
          )}

          {/* ✅ Buttons row (added "Estimations") */}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl cursor-pointer"
              onClick={() => router.push(`/patients/${patientId}/estimations`)}
              disabled={!patient || !!patientErrorMessage}
              title={!patient ? 'Patient not loaded' : 'View estimations'}
            >
              Estimations
            </Button>

            <Button
              type="button"
              variant="outline"
              className="rounded-2xl cursor-pointer"
              disabled={!patient || avoidLoading || unavoidLoading}
              onClick={async () => {
                if (!patient) return;
                try {
                  if (isAvoidedFlag(patient)) {
                    await unavoidPatient({ patientId }).unwrap();
                  } else {
                    await avoidPatient({ patientId }).unwrap();
                  }
                } catch (e) {
                  console.error(e);
                }
              }}
            >
              {isAvoidedFlag(patient) ? 'Un-avoid' : 'Avoid'}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="rounded-2xl cursor-pointer"
              onClick={() => setEditOpen(true)}
              disabled={!patient}
            >
              Edit details
            </Button>

            {editOpen && patient ? (
              <EditPatientModal patient={patient} onClose={() => setEditOpen(false)} />
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="rounded-2xl cursor-pointer"
              onClick={() => router.push(`/patients/${patientId}/printing/prescription-blank`)}
              disabled={!patient || !!patientErrorMessage}
              title={!patient ? 'Patient not loaded' : 'Print blank prescription'}
            >
              Print blank Rx
            </Button>

            <Button
              type="button"
              className="rounded-2xl cursor-pointer"
              onClick={() => setRegisterOpen(true)}
              disabled={!patient || !!patientErrorMessage}
            >
              Register checkup
            </Button>
          </div>

          {registerOpen ? (
            <RegisterVisitModal patientId={patientId} onClose={() => setRegisterOpen(false)} />
          ) : null}
        </Card>
      </div>

      {/* rest unchanged */}
      <div className="flex flex-col gap-4 pt-10">
        <div className="flex items-center justify-end gap-6">
          <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-full border-gray-200 bg-white px-4 text-xs text-gray-800 hover:bg-gray-100 cursor-pointer"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? formatVisitDate(selectedDate) : 'Pick a date'}
              </Button>
            </PopoverTrigger>

            <PopoverContent align="end" className="w-auto rounded-2xl p-2">
              <Calendar
                mode="single"
                selected={selectedDateObj}
                onSelect={(d) => {
                  if (!d) {
                    setSelectedDate('');
                    return;
                  }
                  setSelectedDate(toISODate(d));
                  setDatePopoverOpen(false);
                }}
              />

              {selectedDate ? (
                <div className="flex justify-end px-2 pb-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 rounded-xl px-3 text-xs"
                    onClick={() => {
                      setSelectedDate('');
                      setDatePopoverOpen(false);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <Card className="overflow-hidden rounded-2xl border-none bg-white px-0 py-0 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Visit Date
                  </TableHead>
                  <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Reason
                  </TableHead>
                  <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Type
                  </TableHead>
                  <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Stage
                  </TableHead>
                  <TableHead className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {visitsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">
                      Loading visits…
                    </TableCell>
                  </TableRow>
                ) : visitsErrorMessage ? (
                  <TableRow>
                    <TableCell colSpan={5} className="px-6 py-10 text-center text-sm text-red-600">
                      {visitsErrorMessage}
                    </TableCell>
                  </TableRow>
                ) : !hasRows ? (
                  <TableRow>
                    <TableCell colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">
                      No visits found{selectedDate ? ` for ${selectedDate}` : ''}.
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
                              {formatVisitDate(anchor.visitDate)}
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
                              <Button
                                type="button"
                                variant="outline"
                                className="h-9 rounded-xl px-3 text-xs cursor-pointer"
                                onClick={() => router.push(`/visits/${anchor.visitId}`)}
                              >
                                View <ArrowRight className="ml-1 h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>

                          {followups.map((f) => {
                            const a = visitById.get(anchor.visitId) ?? anchor;

                            return (
                              <TableRow key={f.visitId} className="hover:bg-gray-50/60">
                                <TableCell className="px-6 py-4 align-top">
                                  <div className="flex items-center gap-3">
                                    <div className="ml-1 h-8 w-0.5 rounded-full bg-gray-200" />
                                    <div className="text-sm text-gray-900">
                                      {formatVisitDate(f.visitDate)}
                                    </div>
                                  </div>
                                </TableCell>

                                <TableCell className="px-6 py-4 align-top">
                                  <div className="flex items-start gap-3">
                                    <div className="ml-1 h-8 w-0.5 rounded-full bg-gray-200" />
                                    <div className="min-w-0 flex-1">
                                      {renderReasonCell(f, { kind: 'FOLLOWUP', anchor: a })}
                                    </div>
                                  </div>
                                </TableCell>

                                <TableCell className="px-6 py-4 align-top">
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

                                <TableCell className="px-6 py-4 align-top">
                                  <Badge
                                    variant="outline"
                                    className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(
                                      f.status,
                                    )}`}
                                  >
                                    {stageLabel(f.status)}
                                  </Badge>
                                </TableCell>

                                <TableCell className="px-6 py-4 align-top text-right">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9 rounded-xl px-3 text-xs"
                                    onClick={() => router.push(`/visits/${f.visitId}`)}
                                  >
                                    View <ArrowRight className="ml-1 h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}

                    {groups.orphanGroups.length
                      ? groups.orphanGroups.map(({ followup }) => {
                          const aId = anchorIdFromVisit(followup);
                          const a = aId ? visitById.get(aId) : undefined;

                          return (
                            <TableRow key={followup.visitId} className="hover:bg-gray-50/60">
                              <TableCell className="px-6 py-4 align-top text-sm text-gray-900">
                                {formatVisitDate(followup.visitDate)}
                              </TableCell>

                              <TableCell className="px-6 py-4 align-top">
                                {renderReasonCell(followup, { kind: 'FOLLOWUP', anchor: a })}
                              </TableCell>

                              <TableCell className="px-6 py-4 align-top">
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

                              <TableCell className="px-6 py-4 align-top">
                                <Badge
                                  variant="outline"
                                  className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(
                                    followup.status,
                                  )}`}
                                >
                                  {stageLabel(followup.status)}
                                </Badge>
                              </TableCell>

                              <TableCell className="px-6 py-4 align-top text-right">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-9 rounded-xl px-3 text-xs"
                                  onClick={() => router.push(`/visits/${followup.visitId}`)}
                                >
                                  View <ArrowRight className="ml-1 h-4 w-4" />
                                </Button>
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
              <div className="border-t bg-white px-4 py-3">
                <SimplePagination
                  page={pageSafe}
                  totalPages={totalAnchorPages}
                  onPageChange={setPage}
                />
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </section>
  );
}
