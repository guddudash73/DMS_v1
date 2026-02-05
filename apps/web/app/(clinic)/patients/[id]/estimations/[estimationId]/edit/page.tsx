// apps/web/app/(clinic)/patients/[id]/estimations/[estimationId]/edit/page.tsx
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  useGetEstimationByIdQuery,
  useUpdateEstimationMutation,
  useGetMeQuery,
  useGetPatientByIdQuery,
} from '@/src/store/api';

import { EstimationEditor } from '@/components/estimations/EstimationEditor';
import type { Role } from '@dcm/types';

function canEdit(role?: Role) {
  return role === 'DOCTOR' || role === 'ADMIN';
}

export default function EditEstimationPage() {
  const params = useParams<{ id: string; estimationId: string }>();
  const patientId = String(params.id);
  const estimationId = String(params.estimationId);
  const router = useRouter();

  const me = useGetMeQuery().data ?? null;
  const role = me?.role;

  const { data, isLoading, error } = useGetEstimationByIdQuery({ patientId, estimationId });
  const [updateEstimation, { isLoading: saving }] = useUpdateEstimationMutation();

  // ✅ Fetch patient (for header display in EstimationEditor)
  const patientQuery = useGetPatientByIdQuery(patientId, { skip: !patientId });
  const patientName = patientQuery.data?.name ?? '—';

  if (!canEdit(role)) {
    return (
      <section className="p-6">
        <p className="text-sm text-red-600">You are not allowed to edit estimations.</p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="p-6">
        <p className="text-sm text-gray-600">Loading…</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="p-6">
        <p className="text-sm text-red-600">Unable to load estimation.</p>
      </section>
    );
  }

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10 w-full">
      <EstimationEditor
        title={`Edit Estimation • ${data.estimationNo}`}
        patientName={patientName}
        initial={data}
        submitting={saving}
        onCancel={() => router.push(`/patients/${patientId}/estimations/${estimationId}`)}
        onSubmit={async (patch) => {
          const updated = await updateEstimation({
            patientId,
            estimationId,
            patch,
          }).unwrap();

          router.push(`/patients/${patientId}/estimations/${updated.estimationId}`);
        }}
      />
    </section>
  );
}
