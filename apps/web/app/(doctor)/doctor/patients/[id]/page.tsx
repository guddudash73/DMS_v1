'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

import type { PatientId, Visit } from '@dcm/types';
import {
  useGetPatientByIdQuery,
  useGetPatientVisitsQuery,
  useGetPatientSummaryQuery,
  type ErrorResponse,
} from '@/src/store/api';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
import { formatClinicDateShort, clinicDateISO } from '@/src/lib/clinicTime';

type ApiError = {
  status?: number;
  data?: unknown;
};

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

type VisitKind = 'NEW' | 'FOLLOWUP';

function getAnchorVisitId(v: Visit): string | null {
  const rec = v as unknown as Record<string, unknown>;
  const raw = rec?.anchorVisitId;
  const id = typeof raw === 'string' ? raw : null;
  return id && id.length > 0 ? id : null;
}

function getIsZeroBilled(v: Visit): boolean {
  const rec = v as unknown as Record<string, unknown>;
  return rec?.zeroBilled === true;
}

function getKind(v: Visit): VisitKind {
  const anchor = getAnchorVisitId(v);
  if (!anchor) return 'NEW';
  if (anchor === v.visitId) return 'NEW';
  return 'FOLLOWUP';
}

function visitTitle(v: Visit): string {
  return (v.reason || '').trim() || '—';
}

function followupMetaText(_f: Visit, anchor: Visit | null): string {
  if (!anchor) return 'Follow-up of: —';
  const aName = visitTitle(anchor);
  const aDate = anchor.visitDate ? formatVisitDate(anchor.visitDate) : '—';
  return `Follow-up of: ${aName} • ${aDate}`;
}

function followupCountText(n: number): string {
  if (n <= 0) return 'No follow-ups';
  if (n === 1) return '1 follow-up';
  return `${n} follow-ups`;
}

export default function DoctorPatientDetailPage() {
  const params = useParams<{ id: string }>();
  const rawId = params?.id;
  const router = useRouter();

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

  const allById = React.useMemo(() => {
    const m = new Map<string, Visit>();
    for (const v of sortedVisits) m.set(v.visitId, v);
    return m;
  }, [sortedVisits]);

  const grouped = React.useMemo(() => {
    const anchorById = new Map<string, Visit>();
    const followupsByAnchor = new Map<string, Visit[]>();

    for (const v of filteredVisits) {
      const kind = getKind(v);
      if (kind === 'NEW') {
        anchorById.set(v.visitId, v);
        if (!followupsByAnchor.has(v.visitId)) followupsByAnchor.set(v.visitId, []);
        continue;
      }

      const anchorId = getAnchorVisitId(v);
      if (!anchorId) continue;

      const arr = followupsByAnchor.get(anchorId) ?? [];
      arr.push(v);
      followupsByAnchor.set(anchorId, arr);
    }

    for (const [anchorId] of followupsByAnchor) {
      if (!anchorById.has(anchorId)) {
        const fromAll = allById.get(anchorId);
        if (fromAll) anchorById.set(anchorId, fromAll);
      }
    }

    const anchorsOrdered = Array.from(anchorById.values()).sort((a, b) => {
      const ad = a.visitDate || '';
      const bd = b.visitDate || '';
      if (ad !== bd) return bd.localeCompare(ad);
      return (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0);
    });

    for (const [anchorId, arr] of followupsByAnchor) {
      arr.sort((a, b) => (a.updatedAt ?? a.createdAt ?? 0) - (b.updatedAt ?? b.createdAt ?? 0));
      followupsByAnchor.set(anchorId, arr);
    }

    return { anchorsOrdered, followupsByAnchor };
  }, [filteredVisits, allById]);

  const PAGE_SIZE = 4;
  const [page, setPage] = React.useState<number>(1);

  React.useEffect(() => {
    setPage(1);
  }, [selectedDate, visitsData?.items]);

  const totalAnchorPages = Math.max(1, Math.ceil(grouped.anchorsOrdered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalAnchorPages);

  const pageAnchors = React.useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return grouped.anchorsOrdered.slice(start, start + PAGE_SIZE);
  }, [grouped.anchorsOrdered, pageSafe]);

  const openDoctorVisit = (visitId: string) => {
    router.push(`/doctor/visits/${visitId}`);
  };

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="flex flex-col gap-4">
        <Card className="rounded-2xl border-none bg-white px-8 py-8 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Patient Details:</h2>

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
                  <dt className="w-28 shrink-0 text-gray-600">DOB/Sex</dt>
                  <dd className="text-gray-900">
                    : {patient.dob ?? '—'} / {patient.gender ?? '—'}
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
        </Card>
      </div>

      <div className="flex flex-col gap-4 pt-8">
        <div className="flex items-center justify-end gap-6">
          <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-full border-gray-200 bg-white px-4 text-xs text-gray-800 hover:bg-gray-100"
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
                  setSelectedDate(clinicDateISO(d));
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
                ) : pageAnchors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">
                      No visits found{selectedDate ? ` for ${selectedDate}` : ''}.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageAnchors.map((anchor) => {
                    const anchorId = anchor.visitId;
                    const followups = grouped.followupsByAnchor.get(anchorId) ?? [];

                    return (
                      <React.Fragment key={anchorId}>
                        <TableRow className="hover:bg-gray-50/60">
                          <TableCell className="px-6 py-4 text-sm font-medium text-gray-900">
                            {formatVisitDate(anchor.visitDate)}
                          </TableCell>

                          <TableCell className="px-6 py-4">
                            <div className="text-sm font-semibold text-gray-900">
                              {visitTitle(anchor)}
                            </div>
                            <div className="mt-1 text-[11px] text-gray-500">
                              {followupCountText(followups.length)}
                            </div>
                          </TableCell>

                          <TableCell className="px-6 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className="rounded-full border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700"
                              >
                                NEW
                              </Badge>
                              {getIsZeroBilled(anchor) ? (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700"
                                >
                                  ZERO BILLED
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>

                          <TableCell className="px-6 py-4">
                            <Badge
                              variant="outline"
                              className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(
                                anchor.status,
                              )}`}
                            >
                              {stageLabel(anchor.status)}
                            </Badge>
                          </TableCell>

                          <TableCell className="px-6 py-4 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 rounded-xl px-3 text-xs"
                              onClick={() => openDoctorVisit(anchor.visitId)}
                            >
                              View <ArrowRight className="ml-1 h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>

                        {followups.map((f) => {
                          const anchorRef = allById.get(getAnchorVisitId(f) ?? '') ?? anchor;

                          return (
                            <TableRow key={f.visitId} className="bg-white hover:bg-gray-50/60">
                              <TableCell className="px-6 py-2 align-top">
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 h-8 w-0.5 rounded-full bg-gray-200" />
                                  <div className="text-[13px] font-medium text-gray-900">
                                    {formatVisitDate(f.visitDate)}
                                  </div>
                                </div>
                              </TableCell>

                              <TableCell className="px-6 py-2 align-top">
                                <div className="text-[13px] font-semibold text-gray-900">
                                  {visitTitle(f)}
                                </div>
                                <div className="mt-0.5 text-[10px] text-gray-500">
                                  {followupMetaText(f, anchorRef)}
                                </div>
                              </TableCell>

                              <TableCell className="px-6 py-2 align-top">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className="rounded-full border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-semibold text-violet-700"
                                  >
                                    FOLLOW UP
                                  </Badge>
                                  {getIsZeroBilled(f) ? (
                                    <Badge
                                      variant="outline"
                                      className="rounded-full border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-semibold text-rose-700"
                                    >
                                      ZERO BILLED
                                    </Badge>
                                  ) : null}
                                </div>
                              </TableCell>

                              <TableCell className="px-6 py-2 align-top">
                                <Badge
                                  variant="outline"
                                  className={`rounded-full px-4 py-1 text-[11px] font-semibold ${stageBadgeClass(
                                    f.status,
                                  )}`}
                                >
                                  {stageLabel(f.status)}
                                </Badge>
                              </TableCell>

                              <TableCell className="px-6 py-2 text-right align-top">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 rounded-xl px-3 text-xs"
                                  onClick={() => openDoctorVisit(f.visitId)}
                                >
                                  View <ArrowRight className="ml-1 h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {grouped.anchorsOrdered.length > PAGE_SIZE ? (
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
