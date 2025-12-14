'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';

import type { PatientId, VisitCreate } from '@dms/types';
import {
  useGetPatientByIdQuery,
  useGetDoctorsQuery,
  useCreateVisitMutation,
  type ErrorResponse,
} from '@/src/store/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

type VisitTag = 'N' | 'F' | 'Z';

export default function RegisterVisitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const patientIdParam = searchParams.get('patientId');
  const patientId = patientIdParam as PatientId | null;

  const [reason, setReason] = React.useState('');
  const [doctorId, setDoctorId] = React.useState('');
  const [tag, setTag] = React.useState<VisitTag | undefined>('N');
  const [submitting, setSubmitting] = React.useState(false);

  const {
    data: patient,
    isLoading: patientLoading,
    error: rawPatientError,
  } = useGetPatientByIdQuery(patientId!, {
    skip: !patientId,
  });

  const { data: doctors, isLoading: doctorsLoading } = useGetDoctorsQuery(undefined, {
    skip: !patientId,
  });

  const [createVisit] = useCreateVisitMutation();

  React.useEffect(() => {
    if (!doctorId && doctors && doctors.length > 0) {
      setDoctorId(doctors[0].doctorId);
    }
  }, [doctors, doctorId]);

  const patientErrorMessage = React.useMemo(() => {
    if (!rawPatientError) return null;
    const e = rawPatientError as ApiError;
    const maybe = asErrorResponse(e.data);
    return maybe?.message ?? 'Unable to load patient.';
  }, [rawPatientError]);

  const handleClose = () => {
    router.back();
  };

  const handleSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();

    if (!patientId) {
      toast.error('Missing patient information.');
      return;
    }

    if (!doctorId) {
      toast.error('Please select a doctor.');
      return;
    }

    if (!reason.trim()) {
      toast.error('Please enter a reason for the visit.');
      return;
    }

    const payload: VisitCreate = {
      patientId,
      doctorId,
      reason: reason.trim(),
      ...(tag ? { tag } : {}),
    };

    try {
      setSubmitting(true);
      await createVisit(payload).unwrap();
      toast.success('Visit registered and added to the queue.');
      handleClose();
    } catch (err) {
      console.error(err);
      const e = err as ApiError;
      const maybe = asErrorResponse(e.data);
      toast.error(maybe?.message ?? 'Failed to register visit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!patientId) {
    return (
      <section className="flex h-full items-center justify-center">
        <p className="text-sm text-red-600">No patient selected for visit.</p>
      </section>
    );
  }

  return (
    <section className="relative h-full">
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/10 backdrop-blur-sm">
        <Card className="w-full max-w-2xl rounded-2xl border-none bg-white shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold text-gray-900">Register Checkup</CardTitle>
          </CardHeader>

          <CardContent className="pt-0">
            {patientLoading && (
              <div className="mb-4 space-y-2 text-sm text-gray-600" aria-busy="true">
                <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
              </div>
            )}

            {!patientLoading && patientErrorMessage && (
              <p className="mb-4 text-sm text-red-600">{patientErrorMessage}</p>
            )}

            {!patientLoading && patient && (
              <div className="mb-5 grid grid-cols-1 gap-3 text-sm text-gray-800 md:grid-cols-2">
                <dl className="space-y-1">
                  <div className="flex gap-2">
                    <dt className="w-24 text-gray-500">Name</dt>
                    <dd>{patient.name}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 text-gray-500">Contact No.</dt>
                    <dd>{patient.phone ?? '—'}</dd>
                  </div>
                </dl>
                <dl className="space-y-1 md:justify-self-end">
                  <div className="flex gap-2">
                    <dt className="w-28 text-gray-500">Regd. Date</dt>
                    <dd>
                      {patient.createdAt
                        ? new Date(patient.createdAt).toLocaleDateString('en-GB')
                        : '—'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 text-gray-500">SD-ID</dt>
                    <dd>{patient.patientId}</dd>
                  </div>
                </dl>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-1">
                  <label htmlFor="doctor" className="text-sm font-medium text-gray-800">
                    Doctor
                  </label>
                  <select
                    id="doctor"
                    className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                    value={doctorId}
                    onChange={(e) => setDoctorId(e.target.value)}
                    disabled={doctorsLoading}
                  >
                    <option value="">Choose doctor…</option>
                    {doctors?.map((d) => (
                      <option key={d.doctorId} value={d.doctorId}>
                        {d.fullName || d.displayName || d.doctorId}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-800">Tag</p>
                  <div className="flex items-center gap-4 text-xs text-gray-700">
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="radio"
                        className="h-3 w-3"
                        value="N"
                        checked={tag === 'N'}
                        onChange={() => setTag('N')}
                      />
                      <span>N</span>
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="radio"
                        className="h-3 w-3"
                        value="F"
                        checked={tag === 'F'}
                        onChange={() => setTag('F')}
                      />
                      <span>F</span>
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="radio"
                        className="h-3 w-3"
                        value="Z"
                        checked={tag === 'Z'}
                        onChange={() => setTag('Z')}
                      />
                      <span>Z</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="reason" className="text-sm font-medium text-gray-800">
                  Reason
                </label>
                <Input
                  id="reason"
                  placeholder="Enter the reason for this visit"
                  className="h-10 rounded-xl text-sm"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-xl px-4 text-sm"
                  onClick={handleClose}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="h-10 rounded-xl bg-black px-6 text-sm font-medium text-white hover:bg-black/90"
                >
                  {submitting ? 'Creating…' : 'Create Visit'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
