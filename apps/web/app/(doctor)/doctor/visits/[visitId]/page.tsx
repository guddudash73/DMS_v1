'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { XrayUploader } from '@/components/xray/XrayUploader';
import { XrayGallery } from '@/components/xray/XrayGallery';
import { Button } from '@/components/ui/button';

export default function DoctorVisitHandlingPage() {
  const params = useParams();
  const visitId = useMemo(() => String(params.visitId ?? ''), [params.visitId]);

  const [refreshTick, setRefreshTick] = useState(0);

  return (
    <div className="p-4 2xl:p-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">
            Prescription Preview (placeholder)
          </div>
          <div className="mt-3 h-[520px] rounded-xl border bg-gray-50 p-4 text-xs text-gray-500">
            This area will render the printable prescription preview next day.
            <div className="mt-2 text-[10px]">VisitId: {visitId}</div>
          </div>
        </Card>

        <Card className="rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="text-lg font-semibold text-gray-900">Medicines</div>
            <div className="flex items-center gap-2">
              <XrayUploader visitId={visitId} onUploaded={() => setRefreshTick((t) => t + 1)} />
              <Button type="button" variant="outline" className="rounded-xl">
                Import Preset
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-xl border">
            <div className="grid grid-cols-5 gap-2 border-b bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-600">
              <div>Medicine Name</div>
              <div>Frequency</div>
              <div>Duration</div>
              <div>Timing</div>
              <div>Notes</div>
            </div>

            <div className="px-3 py-3 text-xs text-gray-500">
              Static medicines UI placeholder for today. Next day we’ll make this dynamic.
            </div>
          </div>

          <div className="mt-6">
            <XrayGallery key={refreshTick} visitId={visitId} />
          </div>
        </Card>
      </div>
    </div>
  );
}
