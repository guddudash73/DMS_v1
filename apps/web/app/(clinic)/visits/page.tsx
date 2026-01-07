'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';

import type { PatientId, VisitCreate } from '@dms/types';
import {
  useGetPatientByIdQuery,
  useGetPatientVisitsQuery,
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

type VisitTag = 'N' | 'F';

type VisitSummaryItem = {
  visitId: string;
  visitDate?: string;
  createdAt?: number;
  opdNo?: string;
  tag?: string;
};

function safeVisitLabel(v: VisitSummaryItem) {
  const date = v.visitDate ? String(v.visitDate) : '—';
  const idShort = v.visitId ? `#${String(v.visitId).slice(0, 8)}` : '';
  const opd = v.opdNo ? String(v.opdNo) : idShort;
  return `${date} • ${opd}`;
}

export default function RegisterVisitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const patientIdParam = searchParams.get('patientId');
  const patientId = patientIdParam as PatientId | null;

  const [reason, setReason] = React.useState('');
  const [tag, setTag] = React.useState<VisitTag | undefined>('N');
  const [zeroBilled, setZeroBilled] = React.useState(false);
  const [anchorVisitId, setAnchorVisitId] = React.useState<string | undefined>(undefined);

  const [submitting, setSubmitting] = React.useState(false);

  const {
    data: patient,
    isLoading: patientLoading,
    error: rawPatientError,
  } = useGetPatientByIdQuery(patientId!, {
    skip: !patientId,
  });

  const visitsQuery = useGetPatientVisitsQuery(patientId!, {
    skip: !patientId,
  });

  const [createVisit] = useCreateVisitMutation();

  const patientErrorMessage = React.useMemo(() => {
    if (!rawPatientError) return null;
    const e = rawPatientError as ApiError;
    const maybe = asErrorResponse(e.data);
    return maybe?.message ?? 'Unable to load patient.';
  }, [rawPatientError]);

  const handleClose = () => {
    router.back();
  };

  const anchorCandidates = React.useMemo(() => {
    const items = (visitsQuery.data as any)?.items as VisitSummaryItem[] | undefined;
    const list = Array.isArray(items) ? items : [];

    return list
      .filter((v) => v && v.visitId && v.tag === 'N')
      .slice()
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [visitsQuery.data]);

  React.useEffect(() => {
    if (tag !== 'F') {
      setAnchorVisitId(undefined);
      return;
    }

    // Default anchor to latest N if not chosen yet
    setAnchorVisitId((prev) => prev ?? anchorCandidates[0]?.visitId ?? undefined);
  }, [tag, anchorCandidates]);

  const handleSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();

    if (!patientId) {
      toast.error('Missing patient information.');
      return;
    }

    if (!reason.trim()) {
      toast.error('Please enter a reason for the visit.');
      return;
    }

    if (tag === 'F' && !anchorVisitId) {
      toast.error('Please select the New (N) visit this follow-up refers to.');
      return;
    }

    const payload: VisitCreate = {
      patientId,
      reason: reason.trim(),
      ...(tag ? { tag } : {}),
      ...(zeroBilled ? { zeroBilled: true } : {}),
      ...(tag === 'F' && anchorVisitId ? { anchorVisitId: anchorVisitId as any } : {}),
    };

    try {
      setSubmitting(true);
      await createVisit(payload).unwrap();
      toast.success('Visit registered and added to the queue.');
      handleClose();
    } catch (err) {
      console.error(err);
      const e2 = err as ApiError;
      const maybe = asErrorResponse(e2.data);
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
                    <dd>{(patient as any)?.sdId ?? patient.patientId}</dd>
                  </div>
                </dl>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
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

                    <label className="inline-flex items-center gap-2 ml-2">
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={zeroBilled}
                        onChange={(e) => setZeroBilled(e.target.checked)}
                      />
                      <span>Zero billed (Z)</span>
                    </label>
                  </div>
                </div>
              </div>

              {tag === 'F' ? (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-800">
                    Follow-up for New (N) Visit
                  </label>
                  <select
                    className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                    value={anchorVisitId ?? ''}
                    onChange={(e) => setAnchorVisitId(e.target.value || undefined)}
                  >
                    {anchorCandidates.length === 0 ? (
                      <option value="">No prior N visits found</option>
                    ) : (
                      <>
                        <option value="">Select an N visit…</option>
                        {anchorCandidates.map((v) => (
                          <option key={v.visitId} value={v.visitId}>
                            {safeVisitLabel(v)}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  <p className="h-3 text-xs">&nbsp;</p>
                </div>
              ) : null}

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
