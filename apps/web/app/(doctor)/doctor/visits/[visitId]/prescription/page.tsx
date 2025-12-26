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
import { useAuth } from '@/src/hooks/useAuth';

export default function DoctorVisitHandlingPage() {
  const params = useParams();
  const router = useRouter();

  const visitId = useMemo(() => String(params.visitId ?? ''), [params.visitId]);

  const auth = useAuth();
  const doctorId = auth.userId ?? '';
  const doctorName = doctorId ? `Doctor (${doctorId})` : 'Doctor';

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const patientId = visitQuery.data?.patientId;

  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !patientId });

  const [updateVisitStatus, updateVisitStatusState] = useUpdateVisitStatusMutation();

  const visitStatus = visitQuery.data?.status;
  const isDone = visitStatus === 'DONE';

  // ✅ controlled from PrescriptionWorkspace
  const [isRevisionMode, setIsRevisionMode] = useState(false);

  const canEndSession =
    !!visitId &&
    !!doctorId &&
    (visitStatus === 'IN_PROGRESS' || visitStatus === 'QUEUED') &&
    !updateVisitStatusState.isLoading;

  const onEndSession = async () => {
    if (!visitId) return;

    if (!doctorId) {
      toast.error('Missing doctor session. Please re-login.');
      return;
    }

    try {
      await updateVisitStatus({
        visitId,
        status: 'DONE',
        doctorId,
        date: visitQuery.data?.visitDate,
      }).unwrap();

      toast.success('Session ended. Visit marked as DONE.');
      router.push('/doctor');
    } catch (err: any) {
      toast.error(err?.data?.message ?? err?.message ?? 'Failed to end session.');
    }
  };

  const onEndRevision = () => {
    // ✅ just exit revision mode; visit is already DONE
    setIsRevisionMode(false);
    toast.success('Revision ended.');
  };

  return (
    <div className="p-4 2xl:p-8">
      <div className="mb-4 flex items-center justify-end gap-3">
        {/* ✅ hide Hold Session on DONE visits */}
        {!isDone ? (
          <Button type="button" variant="outline" className="rounded-xl" disabled>
            Hold Session
          </Button>
        ) : null}

        <Button
          type="button"
          className="rounded-xl bg-black text-white hover:bg-black/90"
          disabled={
            isDone ? !isRevisionMode : !canEndSession // ✅ in DONE, only clickable if revision mode active
          }
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
        doctorName={doctorName}
        visitDateLabel={
          visitQuery.data?.visitDate ? `Visit: ${visitQuery.data.visitDate}` : undefined
        }
        visitStatus={visitStatus}
        onRevisionModeChange={setIsRevisionMode}
      />
    </div>
  );
}
