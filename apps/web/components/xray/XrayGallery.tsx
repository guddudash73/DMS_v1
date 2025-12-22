'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useListVisitXraysQuery, useGetXrayUrlQuery } from '@/src/store/api';
import { XrayViewerModal } from './XrayViewerModal';

type Props = {
  visitId: string;
  refreshKey?: number;
};

function Thumb({ xrayId }: { xrayId: string }) {
  const { data } = useGetXrayUrlQuery({ xrayId, size: 'thumb' });
  if (!data?.url) return <div className="h-24 w-24 rounded-lg bg-gray-100" />;

  return (
    <Image
      src={data.url}
      alt="X-ray thumb"
      width={160}
      height={160}
      className="h-24 w-24 rounded-lg object-cover"
      unoptimized
    />
  );
}

export function XrayGallery({ visitId }: Props) {
  const { data, isLoading, isError, refetch } = useListVisitXraysQuery({ visitId });
  const items = data?.items ?? [];

  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const empty = useMemo(
    () => !isLoading && !isError && items.length === 0,
    [isLoading, isError, items.length],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">X-rays</div>
        <button
          type="button"
          className="text-xs text-gray-600 hover:underline"
          onClick={() => void refetch()}
        >
          Refresh
        </button>
      </div>

      {isLoading && <div className="text-xs text-gray-500">Loading…</div>}
      {isError && <div className="text-xs text-red-600">Failed to load X-rays.</div>}
      {empty && <div className="text-xs text-gray-500">No X-rays uploaded yet.</div>}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {items.map((x) => (
            <button
              key={x.xrayId}
              type="button"
              className="group rounded-xl border bg-white p-2 hover:shadow-sm"
              onClick={() => {
                setActiveId(x.xrayId);
                setViewerOpen(true);
              }}
            >
              <Thumb xrayId={x.xrayId} />
              <div className="mt-2 text-left">
                <div className="text-[11px] font-medium text-gray-800">
                  {new Date(x.takenAt).toLocaleString()}
                </div>
                <div className="text-[10px] text-gray-500">{Math.round(x.size / 1024)} KB</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {activeId && (
        <XrayViewerModal
          xrayId={activeId}
          open={viewerOpen}
          onOpenChange={(open) => {
            setViewerOpen(open);
            if (!open) setActiveId(null);
          }}
        />
      )}
    </div>
  );
}
