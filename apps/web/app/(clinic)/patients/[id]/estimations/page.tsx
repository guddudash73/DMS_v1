// apps/web/app/(clinic)/patients/[id]/estimations/page.tsx
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Role } from '@dcm/types';

import {
  useGetPatientByIdQuery,
  useGetPatientEstimationsQuery,
  useGetMeQuery,
  useDeleteEstimationMutation,
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

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function canManage(role?: Role) {
  return role === 'DOCTOR' || role === 'ADMIN';
}

export default function PatientEstimationsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const patientId = params.id;

  const me = useGetMeQuery().data ?? null;
  const role = me?.role;

  const { data: patient } = useGetPatientByIdQuery(patientId);
  const { data, isLoading, error } = useGetPatientEstimationsQuery(patientId);

  const [deleteEstimation, { isLoading: deleting }] = useDeleteEstimationMutation();

  const items = data?.items ?? [];
  const today = todayIso();

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10 w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Estimations</h1>
          <p className="mt-1 text-sm text-gray-600">
            Patient: <span className="font-semibold text-gray-900">{patient?.name ?? '—'}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => router.push(`/patients/${patientId}`)}
          >
            Back
          </Button>

          {canManage(role) ? (
            <Button
              className="rounded-2xl"
              onClick={() => router.push(`/patients/${patientId}/estimations/new`)}
            >
              Create Estimation
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <Card className="overflow-hidden rounded-2xl border-none bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Estimation No
                </TableHead>
                <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Date
                </TableHead>
                <TableHead className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </TableHead>
                <TableHead className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">
                    Loading estimations…
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={4} className="px-6 py-10 text-center text-sm text-red-600">
                    Unable to load estimations.
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">
                    No estimations found.
                  </TableCell>
                </TableRow>
              ) : (
                items
                  .slice()
                  .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
                  .map((e) => {
                    const expired = e.validUntil ? e.validUntil < today : false;
                    const status = expired ? 'EXPIRED' : 'ACTIVE';

                    return (
                      <TableRow key={e.estimationId} className="hover:bg-gray-50/60">
                        <TableCell className="px-6 py-4 text-sm font-semibold text-gray-900">
                          {e.estimationNo}
                        </TableCell>

                        <TableCell className="px-6 py-4 text-sm text-gray-900">
                          {e.createdAt ? new Date(e.createdAt).toLocaleDateString('en-GB') : '—'}
                        </TableCell>

                        <TableCell className="px-6 py-4">
                          <Badge
                            variant="outline"
                            className={[
                              'rounded-full px-4 py-1 text-xs font-semibold',
                              expired
                                ? 'bg-rose-100 text-rose-700 border-rose-200'
                                : 'bg-green-100 text-green-700 border-green-200',
                            ].join(' ')}
                          >
                            {status}
                          </Badge>
                        </TableCell>

                        <TableCell className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              className="h-9 rounded-xl px-3 text-xs"
                              onClick={() =>
                                router.push(`/patients/${patientId}/estimations/${e.estimationId}`)
                              }
                            >
                              View
                            </Button>

                            {canManage(role) ? (
                              <>
                                <Button
                                  variant="outline"
                                  className="h-9 rounded-xl px-3 text-xs"
                                  onClick={() =>
                                    router.push(
                                      `/patients/${patientId}/estimations/${e.estimationId}/edit`,
                                    )
                                  }
                                >
                                  Edit
                                </Button>

                                <Button
                                  variant="outline"
                                  className="h-9 rounded-xl px-3 text-xs"
                                  disabled={deleting}
                                  onClick={async () => {
                                    const ok = window.confirm('Delete this estimation?');
                                    if (!ok) return;
                                    await deleteEstimation({
                                      patientId,
                                      estimationId: e.estimationId,
                                    }).unwrap();
                                  }}
                                >
                                  Delete
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </section>
  );
}
