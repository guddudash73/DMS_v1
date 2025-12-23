'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { PrescriptionWorkspace } from '@/components/prescription/PrescriptionWorkspace';
import { XrayUploader } from '@/components/xray/XrayUploader';
import { XrayGallery } from '@/components/xray/XrayGallery';
import { useGetVisitByIdQuery, useGetPatientByIdQuery } from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';

export default function DoctorVisitHandlingPage() {
  const params = useParams();
  const visitId = useMemo(() => String(params.visitId ?? ''), [params.visitId]);

  const [refreshTick, setRefreshTick] = useState(0);

  const auth = useAuth();
  const doctorName = auth.userId ? `Doctor (${auth.userId})` : 'Doctor';

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const patientId = visitQuery.data?.patientId;
  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !patientId });

  return (
    <div className="p-4 2xl:p-8">
      <PrescriptionWorkspace
        visitId={visitId}
        patientName={patientQuery.data?.name}
        patientPhone={patientQuery.data?.phone}
        doctorName={doctorName}
        visitDateLabel={
          visitQuery.data?.visitDate ? `Visit: ${visitQuery.data.visitDate}` : undefined
        }
      />

      <div className="mt-6 rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="text-lg font-semibold text-gray-900">X-Rays</div>
          <XrayUploader visitId={visitId} onUploaded={() => setRefreshTick((t) => t + 1)} />
        </div>

        <div className="mt-4">
          <XrayGallery key={refreshTick} visitId={visitId} />
        </div>
      </div>
    </div>
  );
}
