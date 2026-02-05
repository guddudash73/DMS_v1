// apps/web/app/(clinic)/patients/[id]/estimations/new/page.tsx
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  useCreateEstimationMutation,
  useGetMeQuery,
  useGetPatientByIdQuery,
} from '@/src/store/api';

import { EstimationEditor } from '@/components/estimations/EstimationEditor';
import type { Role } from '@dcm/types';

function canCreate(role?: Role) {
  return role === 'DOCTOR' || role === 'ADMIN';
}

export default function NewEstimationPage() {
  const params = useParams<{ id: string }>();
  const patientId = String(params.id);
  const router = useRouter();

  const me = useGetMeQuery().data ?? null;
  const role = me?.role;

  const [createEstimation, { isLoading }] = useCreateEstimationMutation();

  // ✅ Fetch patient (for header display in EstimationEditor)
  const patientQuery = useGetPatientByIdQuery(patientId, { skip: !patientId });
  const patientName = patientQuery.data?.name ?? '—';

  if (!canCreate(role)) {
    return (
      <section className="p-6">
        <p className="text-sm text-red-600">You are not allowed to create estimations.</p>
      </section>
    );
  }

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10 w-full">
      <EstimationEditor
        title="Create Estimation"
        patientName={patientName}
        submitting={isLoading}
        onCancel={() => router.push(`/patients/${patientId}/estimations`)}
        onSubmit={async (body) => {
          const created = await createEstimation({ patientId, body }).unwrap();
          router.push(`/patients/${patientId}/estimations/${created.estimationId}`);
        }}
      />
    </section>
  );
}
