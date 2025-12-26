'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { useGetPatientByIdQuery, useGetPatientVisitsQuery } from '@/src/store/api';

export default function DoctorPatientPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const patientId = React.useMemo(() => String(params?.id ?? ''), [params?.id]);

  const patientQuery = useGetPatientByIdQuery(patientId, { skip: !patientId });
  const visitsQuery = useGetPatientVisitsQuery(patientId, { skip: !patientId });

  if (!patientId) return <div className="p-6">Invalid patient id.</div>;

  if (patientQuery.isLoading) return <div className="p-6">Loading…</div>;

  if (patientQuery.isError) {
    return <div className="p-6 text-red-600">Failed to load patient.</div>;
  }

  if (!patientQuery.data) return <div className="p-6">Patient not found</div>;

  const patient = patientQuery.data;
  const visits = visitsQuery.data?.items ?? [];

  return (
    <div className="space-y-6 p-4 2xl:p-8">
      {/* Patient Details */}
      <Card className="rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xl font-semibold">{patient.name}</div>
            <div className="text-sm text-gray-500">
              {patient.dob ?? '—'} / {patient.gender ?? '—'} • {patient.phone ?? '—'}
            </div>
          </div>
          <Badge variant="outline">Patient</Badge>
        </div>
      </Card>

      {/* Visit History */}
      <Card className="rounded-2xl p-4">
        <div className="mb-3 text-lg font-semibold">Visits</div>

        {visitsQuery.isLoading ? (
          <div className="py-6 text-sm text-gray-500">Loading visits…</div>
        ) : visits.length === 0 ? (
          <div className="py-6 text-sm text-gray-500">No visits found.</div>
        ) : (
          <div className="space-y-2">
            {visits.map((v) => (
              <div
                key={v.visitId}
                className="flex items-center justify-between rounded-xl border p-3 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="font-medium">{v.visitDate ?? '—'}</div>
                  <div className="truncate text-sm text-gray-500">{v.reason ?? '—'}</div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      v.status === 'IN_PROGRESS'
                        ? 'default'
                        : v.status === 'DONE'
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {v.status ?? '—'}
                  </Badge>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/doctor/visits/${v.visitId}`)}
                  >
                    View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
