'use client';

import { useParams, useRouter } from 'next/navigation';

import RxPresetEditor from '@/components/admin/rx-presets/RxPresetEditor';
import { useAuth } from '@/src/hooks/useAuth';
import { useAdminGetRxPresetByIdQuery, useAdminUpdateRxPresetMutation } from '@/src/store/api';

import type { RxLineType } from '@dcm/types';

export default function AdminRxPresetEditPage() {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const params = useParams<{ id: string }>();
  const id = params?.id;

  const router = useRouter();

  const presetQ = useAdminGetRxPresetByIdQuery(
    { id },
    { skip: !canUseApi || !id, refetchOnMountOrArgChange: true },
  );

  const [updatePreset, updateState] = useAdminUpdateRxPresetMutation();

  return (
    <RxPresetEditor
      mode="edit"
      backHref="/admin/rx-presets"
      canUseApi={canUseApi}
      loading={presetQ.isLoading}
      error={presetQ.isError}
      submitting={updateState.isLoading}
      submitLabel="Save Changes"
      initial={{
        name: presetQ.data?.name ?? '',
        tags: presetQ.data?.tags ?? [],
        lines: (presetQ.data?.lines ?? []) as RxLineType[],
      }}
      onSubmit={async (payload) => {
        if (!id) return;
        await updatePreset({ id, patch: payload }).unwrap();
        router.replace('/admin/rx-presets');
      }}
    />
  );
}
