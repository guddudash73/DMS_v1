// apps/web/app/(clinic)/patients/[id]/page.tsx
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

import type { PatientId, Visit } from '@dms/types';
import {
  useGetPatientByIdQuery,
  useGetPatientVisitsQuery,
  useGetDoctorsQuery,
  useGetPatientSummaryQuery,
  useGetMeQuery,
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
import { PrescriptionPrintSheet } from '@/components/prescription/PrescriptionPrintSheet';

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

function normalizeSexFromPatientGender(raw?: string): PatientSex | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim().toUpperCase();
  if (s === 'MALE' || s === 'M') return 'M';
  if (s === 'FEMALE' || s === 'F') return 'F';
  if (s === 'OTHER' || s === 'O') return 'O';
  if (s === 'UNKNOWN' || s === 'U') return 'U';
  return undefined;
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

// ✅ Backend no longer guarantees Visit.doctorId.
// Keep legacy support via safe accessor.
function legacyDoctorIdFromVisit(v: Visit): string | undefined {
  const anyV = v as any;
  const raw =
    (typeof anyV?.doctorId === 'string' && anyV.doctorId) ||
    (typeof anyV?.providerId === 'string' && anyV.providerId) ||
    (typeof anyV?.assignedDoctorId === 'string' && anyV.assignedDoctorId) ||
    undefined;
  return raw || undefined;
}

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const rawId = params?.id;
  const router = useRouter();

  const [registerOpen, setRegisterOpen] = React.useState(false);

  const [printMounted, setPrintMounted] = React.useState(false);
  React.useEffect(() => setPrintMounted(true), []);

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

  const { data: doctors } = useGetDoctorsQuery();

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

  const doctorNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    doctors?.forEach((d) => {
      map.set(d.doctorId, d.fullName || d.displayName || d.doctorId);
    });
    return map;
  }, [doctors]);

  const PAGE_SIZE = 4;
  const [page, setPage] = React.useState<number>(1);

  React.useEffect(() => {
    setPage(1);
  }, [selectedDate, visitsData?.items]);

  const totalPages = Math.max(1, Math.ceil(filteredVisits.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);

  const pageItems = React.useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return filteredVisits.slice(start, start + PAGE_SIZE);
  }, [filteredVisits, pageSafe]);

  const followupLabel = summary?.nextFollowUpDate ?? 'No Follow Up Scheduled';

  const patientDob = safeParseDobToDate(patient?.dob);
  const patientAge = patientDob ? calculateAge(patientDob, new Date()) : undefined;
  const patientSex = normalizeSexFromPatientGender(patient?.gender);

  const doctorName = me?.doctorProfile?.fullName?.trim()
    ? me.doctorProfile.fullName.trim()
    : undefined;

  const doctorRegdLabel = me?.doctorProfile?.registrationNumber
    ? `B.D.S Regd. - ${me.doctorProfile.registrationNumber}`
    : undefined;

  const visitDateLabel = `Visit: ${clinicDateISO()}`;

  const printBlankRx = () => {
    if (!patient) return;

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

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
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

        <Card className="rounded-2xl border-none bg-white px-8 py-6 shadow-sm">
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

          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              onClick={printBlankRx}
              disabled={!patient || !!patientErrorMessage}
              title={!patient ? 'Patient not loaded' : 'Print blank prescription'}
            >
              Print blank Rx
            </Button>

            <Button
              type="button"
              className="rounded-2xl"
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

      <div className="flex flex-col gap-4 pt-10">
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
                    Diagnosis By
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
                ) : pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">
                      No visits found{selectedDate ? ` for ${selectedDate}` : ''}.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((visit) => {
                    const legacyDoctorId = legacyDoctorIdFromVisit(visit);
                    const diagnosisBy = legacyDoctorId
                      ? (doctorNameById.get(legacyDoctorId) ?? legacyDoctorId)
                      : '—';

                    return (
                      <TableRow key={visit.visitId} className="hover:bg-gray-50/60">
                        <TableCell className="px-6 py-4 text-sm font-medium text-gray-900">
                          {formatVisitDate(visit.visitDate)}
                        </TableCell>

                        <TableCell className="px-6 py-4 text-sm text-gray-800">
                          {visit.reason || '—'}
                        </TableCell>

                        <TableCell className="px-6 py-4 text-sm text-gray-800">
                          {diagnosisBy}
                        </TableCell>

                        <TableCell className="px-6 py-4">
                          <Badge
                            variant="outline"
                            className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(
                              visit.status,
                            )}`}
                          >
                            {stageLabel(visit.status)}
                          </Badge>
                        </TableCell>

                        <TableCell className="px-6 py-4 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 rounded-xl px-3 text-xs"
                            onClick={() => router.push(`/visits/${visit.visitId}`)}
                          >
                            View <ArrowRight className="ml-1 h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {filteredVisits.length > PAGE_SIZE ? (
              <div className="border-t bg-white px-4 py-3">
                <SimplePagination page={pageSafe} totalPages={totalPages} onPageChange={setPage} />
              </div>
            ) : null}
          </Card>
        </div>
      </div>

      {printMounted ? (
        <PrescriptionPrintSheet
          patientName={patient?.name}
          patientPhone={patient?.phone}
          patientAge={patientAge}
          patientSex={patientSex}
          sdId={patient?.sdId}
          opdNo={undefined}
          doctorName={doctorName}
          doctorRegdLabel={doctorRegdLabel}
          visitDateLabel={visitDateLabel}
          lines={[]}
          receptionNotes={''}
        />
      ) : null}
    </section>
  );
}
