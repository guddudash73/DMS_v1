'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import {
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetVisitRxQuery,
  useUpdateVisitStatusMutation,
  useGetDoctorsQuery,
  useStartVisitRxRevisionMutation,
} from '@/src/store/api';

import { useAuth } from '@/src/hooks/useAuth';
import { ArrowRight, Stethoscope } from 'lucide-react';

import type { ToothDetail, Visit } from '@dcm/types';
import { clinicDateISO } from '@/src/lib/clinicTime';

// Lazy-load DONE view (heavy: Rx preview + X-rays + history + calendar)
const DoctorVisitDoneView = dynamic(
  () => import('./DoctorVisitDoneView').then((m) => m.DoctorVisitDoneView),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-6 rounded-2xl border bg-white p-4">
          <div className="h-5 w-40 animate-pulse rounded bg-gray-100" />
          <div className="mt-4 h-80 animate-pulse rounded-xl bg-gray-50" />
        </Card>
        <Card className="lg:col-span-6 rounded-2xl border bg-white p-4">
          <div className="h-5 w-24 animate-pulse rounded bg-gray-100" />
          <div className="mt-4 h-80 animate-pulse rounded-xl bg-gray-50" />
        </Card>
      </div>
    ),
  },
);

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

export function DoctorVisitPageClient() {
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

  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: !visitId });
  const rxLatest = (getProp(rxQuery.data, 'rx') as unknown) ?? null;

  const [updateVisitStatus, updateVisitStatusState] = useUpdateVisitStatusMutation();
  const [startRevision, startRevisionState] = useStartVisitRxRevisionMutation();

  // doctors list is cached longer now; still keep it but don’t refetch aggressively
  const doctorsQuery = useGetDoctorsQuery(undefined);

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

  const patient = patientQuery.data ?? null;
  const patientSex = safeSexFromPatient(patient);
  const patientAge = calcAgeYears(getPropString(patient, 'dob'), visitDate) ?? undefined;

  const opdNo = getString(visit?.opdNo) ?? getString(visit?.opdId) ?? undefined;

  const loading = visitQuery.isLoading || patientQuery.isLoading;
  const hasError = visitQuery.isError || patientQuery.isError;

  const sessionMuted = isOffline === true;
  const sessionMutedReason =
    'This is an offline visit. Session editing is disabled in Doctor view.';

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

  if (!visitId) {
    return (
      <section className="p-6">
        <p className="text-sm text-red-600">Invalid visit id.</p>
      </section>
    );
  }

  // tiny, fast header; heavy DONE view is lazily loaded below
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
            {visit?.tag ? (
              <>
                Tag: <span className="font-medium text-gray-700">{visit.tag}</span>
                {' · '}
              </>
            ) : null}
            Stage: <span className="font-medium text-gray-700">{stageLabel(status)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isDone ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl cursor-pointer"
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
            className="rounded-xl cursor-pointer"
            onClick={() => router.back()}
          >
            Back
          </Button>

          {!isDone ? (
            <Button
              type="button"
              className={[
                'rounded-xl cursor-pointer',
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
        <DoctorVisitDoneView
          visitId={visitId}
          patientId={patientId}
          patient={patient}
          visit={visit as Visit}
          doctorName={doctorLabel}
          doctorRegdLabel={doctorRegdLabel}
          visitDate={visitDate}
          visitDateLabel={visitDateLabel}
          opdNo={opdNo}
          rxLatest={rxLatest}
        />
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

            <div className="mt-4 rounded-2xl border p-4">
              <div className="text-xs font-semibold text-gray-700">What’s next</div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-gray-600">
                <li>Add medicines to Rx</li>
                <li>Upload and review X-rays</li>
                <li>Finalize and mark visit as DONE</li>
              </ul>
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
