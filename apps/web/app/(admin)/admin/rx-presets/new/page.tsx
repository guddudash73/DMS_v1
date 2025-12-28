'use client';

import { useRouter } from 'next/navigation';

import RxPresetEditor from '@/components/admin/rx-presets/RxPresetEditor';
import { useAuth } from '@/src/hooks/useAuth';
import { useAdminCreateRxPresetMutation } from '@/src/store/api';

export default function AdminRxPresetNewPage() {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const router = useRouter();
  const [createPreset, createState] = useAdminCreateRxPresetMutation();

  return (
    <RxPresetEditor
      mode="create"
      backHref="/admin/rx-presets"
      canUseApi={canUseApi}
      submitting={createState.isLoading}
      submitLabel="Create Preset"
      initial={{ name: '', tags: [], lines: [] }}
      onSubmit={async (payload) => {
        await createPreset(payload).unwrap();
        router.replace('/admin/rx-presets');
      }}
    />
  );
}
