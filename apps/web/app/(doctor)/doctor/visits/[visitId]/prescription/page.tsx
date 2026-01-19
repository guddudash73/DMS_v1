'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

import { PrescriptionWorkspace } from '@/components/prescription/PrescriptionWorkspace';
import { Button } from '@/components/ui/button';

import {
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useUpdateVisitStatusMutation,
} from '@/src/store/api';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;

  if (isRecord(err)) {
    const data = err.data;
    if (isRecord(data) && typeof data.message === 'string' && data.message.trim())
      return data.message;
    if (typeof err.message === 'string' && err.message.trim()) return err.message;
  }

  return 'Failed to end session.';
}

export default function DoctorVisitHandlingPage() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();

  const visitId = useMemo(() => String(params?.visitId ?? ''), [params?.visitId]);

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const patientId = visitQuery.data?.patientId;

  const patientQuery = useGetPatientByIdQuery(patientId ?? '', {
    skip: !patientId,
  });

  const [updateVisitStatus, updateVisitStatusState] = useUpdateVisitStatusMutation();

  const visitStatus = visitQuery.data?.status;
  const isDone = visitStatus === 'DONE';

  const [isRevisionMode, setIsRevisionMode] = useState(false);

  const canEndSession =
    !!visitId &&
    (visitStatus === 'IN_PROGRESS' || visitStatus === 'QUEUED') &&
    !updateVisitStatusState.isLoading;

  const onEndSession = async () => {
    if (!visitId) return;

    try {
      await updateVisitStatus({
        visitId,
        status: 'DONE',
        date: visitQuery.data?.visitDate,
      }).unwrap();

      toast.success('Session ended. Visit marked as DONE.');
      router.push('/doctor');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    }
  };

  const onEndRevision = () => {
    setIsRevisionMode(false);
    toast.success('Revision ended.');
  };

  const opdNo = useMemo(() => {
    const v: unknown = visitQuery.data;
    if (!isRecord(v)) return undefined;
    const raw = v.opdNo;
    return typeof raw === 'string' ? raw : undefined;
  }, [visitQuery.data]);

  return (
    <div className="p-4 2xl:p-8">
      <div className="mb-4 flex items-center justify-end gap-3">
        {!isDone ? (
          <Button type="button" variant="outline" className="rounded-xl" disabled>
            Hold Session
          </Button>
        ) : null}

        <Button
          type="button"
          className="rounded-xl bg-black text-white hover:bg-black/90"
          disabled={isDone ? !isRevisionMode : !canEndSession}
          onClick={() => {
            if (isDone) return void onEndRevision();
            return void onEndSession();
          }}
        >
          {updateVisitStatusState.isLoading ? 'Ending…' : isDone ? 'End Revision' : 'End Session'}
        </Button>
      </div>

      <PrescriptionWorkspace
        visitId={visitId}
        patientId={patientId}
        patientName={patientQuery.data?.name}
        patientPhone={patientQuery.data?.phone}
        patientSdId={patientQuery.data?.sdId}
        opdNo={opdNo}
        visitStatus={visitStatus}
        onRevisionModeChange={setIsRevisionMode}
      />
    </div>
  );
}
