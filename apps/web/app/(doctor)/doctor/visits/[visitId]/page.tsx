'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import {
  useGetVisitByIdQuery,
  useUpdateVisitStatusMutation,
  useGetPatientByIdQuery,
} from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';

export default function DoctorVisitOverviewPage() {
  const router = useRouter();
  const params = useParams<{ visitId: string }>();

  const visitId = React.useMemo(() => String(params?.visitId ?? ''), [params?.visitId]);

  const auth = useAuth();
  const doctorId = auth.userId ?? '';

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const visit = visitQuery.data;

  const patientQuery = useGetPatientByIdQuery(visit?.patientId ?? '', {
    skip: !visit?.patientId,
  });

  const [updateStatus, updateStatusState] = useUpdateVisitStatusMutation();

  const startSession = async () => {
    if (!visitId) return;

    if (!doctorId) {
      toast.error('Missing doctor session. Please re-login.');
      return;
    }

    if (!visit) {
      toast.error('Visit not loaded yet.');
      return;
    }

    try {
      await updateStatus({
        visitId,
        status: 'IN_PROGRESS',
        doctorId,
        date: visit.visitDate,
      }).unwrap();

      router.push(`/doctor/visits/${visitId}/prescription`);
    } catch (err: any) {
      toast.error(err?.data?.message ?? err?.message ?? 'Failed to start session.');
    }
  };

  const resumeSession = () => {
    router.push(`/doctor/visits/${visitId}/prescription`);
  };

  if (!visitId) return <div className="p-6">Invalid visit id.</div>;

  if (visitQuery.isLoading) return <div className="p-6">Loading…</div>;

  if (visitQuery.isError) {
    return <div className="p-6 text-red-600">Failed to load visit.</div>;
  }

  if (!visit) return <div className="p-6">Visit not found</div>;

  return (
    <div className="space-y-6 p-4 2xl:p-8">
      {/* Patient */}
      <Card className="rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">
              {patientQuery.data?.name ?? 'Patient'}
            </div>
            <div className="text-sm text-gray-500">{patientQuery.data?.phone ?? '—'}</div>
          </div>
          <Badge variant="outline">Visit</Badge>
        </div>
      </Card>

      {/* Visit Details */}
      <Card className="rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{visit.reason ?? '—'}</div>
            <div className="text-sm text-gray-500">{visit.visitDate ?? '—'}</div>
          </div>

          <div className="flex items-center gap-3">
            <Badge>{visit.status}</Badge>

            {visit.status === 'QUEUED' && (
              <Button onClick={() => void startSession()} disabled={updateStatusState.isLoading}>
                {updateStatusState.isLoading ? 'Starting…' : 'Start Session'}
              </Button>
            )}

            {visit.status === 'IN_PROGRESS' && (
              <Button onClick={resumeSession}>Resume Session</Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
