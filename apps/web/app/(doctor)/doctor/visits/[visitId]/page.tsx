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
} from '@/src/store/api';

import { useAuth } from '@/src/hooks/useAuth';
import { ArrowRight, ClipboardList, Image as ImageIcon, Stethoscope } from 'lucide-react';

type PatientSex = 'M' | 'F' | 'O' | 'U';

function safeSexFromPatient(p: any): PatientSex {
  const raw = (p?.gender ?? p?.sex ?? '').toString().trim().toUpperCase();
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

export default function DoctorVisitPage() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();
  const auth = useAuth();

  const visitId = React.useMemo(() => String(params?.visitId ?? ''), [params?.visitId]);
  const doctorId = auth.userId ?? '';

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const visit = visitQuery.data ?? null;

  const patientId = visit?.patientId ?? '';
  const patientQuery = useGetPatientByIdQuery(patientId, { skip: !patientId });
  const patient = patientQuery.data ?? null;

  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: !visitId });
  const rx = rxQuery.data?.rx ?? null;

  const [updateVisitStatus, updateVisitStatusState] = useUpdateVisitStatusMutation();

  const doctorsQuery = useGetDoctorsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  // ✅ In doctor area, doctor is the logged-in doctor (not visit.doctorId).
  const doctorFromList = React.useMemo(() => {
    const list = doctorsQuery.data ?? [];
    if (!doctorId) return null;
    return (list as any[]).find((d) => d.doctorId === doctorId) ?? null;
  }, [doctorsQuery.data, doctorId]);

  const doctorLabel = React.useMemo(() => {
    const name =
      (doctorFromList as any)?.fullName ??
      (doctorFromList as any)?.displayName ??
      (doctorFromList as any)?.name ??
      undefined;

    return name ?? (doctorId ? `Doctor (${doctorId})` : 'Doctor');
  }, [doctorFromList, doctorId]);

  const doctorRegdLabel = React.useMemo(() => {
    const reg = (doctorFromList as any)?.registrationNumber ?? undefined;
    return reg ? `B.D.S Regd. - ${reg}` : undefined;
  }, [doctorFromList]);

  const status = visit?.status;
  const isDone = status === 'DONE';

  const visitDate = visit?.visitDate ?? '';
  const visitDateLabel = visitDate ? `Visit: ${visitDate}` : undefined;

  const patientSex = safeSexFromPatient(patient as any);
  const patientAge = calcAgeYears((patient as any)?.dob, visitDate) ?? undefined;

  const opdNo = (visit as any)?.opdNo ?? (visit as any)?.opdId ?? undefined;

  const openSession = async () => {
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
      } catch (err: any) {
        toast.error(err?.data?.message ?? err?.message ?? 'Failed to start session.');
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

  const loading = visitQuery.isLoading || patientQuery.isLoading;
  const hasError = visitQuery.isError || patientQuery.isError;

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      {/* ✅ rest of your JSX remains same; only doctor label resolution was fixed */}
      {/* (Kept your original render blocks intact below) */}

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-gray-900">Visit</div>
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
              className="rounded-xl bg-black text-white hover:bg-black/90"
              onClick={openSession}
              disabled={updateVisitStatusState.isLoading || loading || hasError}
            >
              {updateVisitStatusState.isLoading
                ? 'Starting…'
                : status === 'IN_PROGRESS'
                  ? 'Continue Session'
                  : 'Start Session'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* unchanged blocks */}
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-6 rounded-2xl border bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-gray-700" />
              <div className="text-sm font-semibold text-gray-900">Prescription</div>
              <div className="ml-auto text-xs text-gray-500">
                {visitDate ? visitDate.replace('Visit:', '').trim() : ''}
              </div>
            </div>

            <div className="min-w-0 overflow-x-hidden">
              <PrescriptionPreview
                patientName={patient?.name}
                patientPhone={patient?.phone}
                patientAge={patientAge}
                patientSex={patientSex}
                sdId={(patient as any)?.sdId}
                opdNo={opdNo}
                doctorName={doctorLabel}
                doctorRegdLabel={doctorRegdLabel}
                visitDateLabel={visitDateLabel}
                lines={rx?.lines ?? []}
                receptionNotes={rx?.receptionNotes ?? ''}
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
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Visit Overview */}
          <Card className="lg:col-span-5 rounded-2xl border bg-white p-6">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-gray-700" />
              <div className="text-sm font-semibold text-gray-900">Visit Overview</div>
            </div>

            <div className="mt-4 grid gap-3 text-sm text-gray-800">
              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Patient</div>
                <div className="font-semibold text-gray-900">{patient?.name ?? '—'}</div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Phone</div>
                <div className="font-semibold text-gray-900">{patient?.phone ?? '—'}</div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Age/Sex</div>
                <div className="font-semibold text-gray-900">
                  {patientAge ? String(patientAge) : '—'}/{patientSex ?? '—'}
                </div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">SD-ID</div>
                <div className="font-semibold text-gray-900">{(patient as any)?.sdId ?? '—'}</div>
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
                <div className="font-semibold text-gray-900">{visit?.reason ?? '—'}</div>
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

          {/* Prescription-style panel + CTA */}
          <Card className="lg:col-span-7 rounded-2xl border bg-white p-6">
            {/* unchanged */}
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
                {status === 'IN_PROGRESS'
                  ? 'Continue the active session to add medicines, upload X-rays, and complete the visit.'
                  : 'Start the session to begin adding medicines and uploading X-rays.'}
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-gray-500">
                  Visit ID: <span className="font-medium text-gray-700">{visitId}</span>
                </div>

                <Button
                  type="button"
                  className="rounded-2xl bg-black px-6 text-white hover:bg-black/90"
                  onClick={openSession}
                  disabled={updateVisitStatusState.isLoading}
                >
                  {updateVisitStatusState.isLoading
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
          </Card>
        </div>
      )}
    </section>
  );
}
