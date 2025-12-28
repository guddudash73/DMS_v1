'use client';

import { useRouter } from 'next/navigation';
import RxPresetEditor from '@/components/admin/rx-presets/RxPresetEditor';
import { useAuth } from '@/src/hooks/useAuth';
import { useCreateRxPresetMutation } from '@/src/store/api';

export default function NewDoctorRxPresetPage() {
  const router = useRouter();
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const [createPreset, { isLoading }] = useCreateRxPresetMutation();

  return (
    <RxPresetEditor
      mode="create"
      backHref="/doctor/rx-presets"
      canUseApi={canUseApi}
      submitting={isLoading}
      submitLabel="Create Preset"
      onSubmit={async (payload) => {
        // default scope: PRIVATE (doctor can change later once you expose scope in editor UI)
        const created = await createPreset({ ...payload, scope: 'PRIVATE' as any }).unwrap();
        router.replace(`/doctor/rx-presets/${created.id}`);
      }}
    />
  );
}
