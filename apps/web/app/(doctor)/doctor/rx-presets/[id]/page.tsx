// apps/web/app/(doctor)/doctor/rx-presets/[id]/page.tsx
'use client';

import { useRouter, useParams } from 'next/navigation';
import RxPresetEditor from '@/components/admin/rx-presets/RxPresetEditor';
import { useAuth } from '@/src/hooks/useAuth';
import { useGetRxPresetByIdQuery, useUpdateRxPresetMutation } from '@/src/store/api';

import type { RxLineType } from '@dms/types';

function asRxLines(lines: unknown): RxLineType[] {
  return Array.isArray(lines) ? (lines as RxLineType[]) : [];
}

export default function EditDoctorRxPresetPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const { data, isLoading, isError } = useGetRxPresetByIdQuery({ id }, { skip: !canUseApi || !id });

  const [updatePreset, { isLoading: saving }] = useUpdateRxPresetMutation();

  if (!id) {
    return <div className="p-6 text-sm text-gray-700">Invalid preset id.</div>;
  }

  return (
    <RxPresetEditor
      mode="edit"
      backHref="/doctor/rx-presets"
      canUseApi={canUseApi}
      loading={isLoading}
      error={isError}
      submitting={saving}
      submitLabel="Save Changes"
      initial={
        data
          ? {
              name: data.name,
              tags: data.tags,
              lines: asRxLines(data.lines),
            }
          : undefined
      }
      onSubmit={async (payload) => {
        await updatePreset({ id, patch: payload }).unwrap();
        router.replace('/doctor/rx-presets');
      }}
    />
  );
}
