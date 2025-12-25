'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useGetXrayUrlQuery, useListVisitXraysQuery } from '@/src/store/api';
import { XrayViewerModal } from './XrayViewerModal';

function Thumb({ xrayId }: { xrayId: string }) {
  const { data } = useGetXrayUrlQuery({ xrayId, size: 'thumb' });
  if (!data?.url) return <div className="h-18 w-18 rounded-xl bg-gray-100" />;

  return (
    <Image
      src={data.url}
      alt="X-ray thumb"
      width={160}
      height={160}
      className="h-18 w-18 rounded-xl object-cover"
      unoptimized
    />
  );
}

export function XrayTrayReadOnly({ visitId }: { visitId: string }) {
  const { data, isLoading, isError, refetch } = useListVisitXraysQuery({ visitId });
  const items = data?.items ?? [];

  const empty = useMemo(
    () => !isLoading && !isError && items.length === 0,
    [isLoading, isError, items.length],
  );

  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const openViewer = (xrayId: string) => {
    setActiveId(xrayId);
    setViewerOpen(true);
  };

  return (
    <div className="rounded-2xl border bg-white p-3">
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

      {isLoading && <div className="mt-2 text-xs text-gray-500">Loading…</div>}
      {isError && <div className="mt-2 text-xs text-red-600">Failed to load X-rays.</div>}
      {empty && <div className="mt-2 text-xs text-gray-500">No X-rays uploaded yet.</div>}

      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {items.map((x) => (
            <button
              key={x.xrayId}
              type="button"
              className="group rounded-2xl border bg-white p-2 pb-3 transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              onClick={() => openViewer(x.xrayId)}
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
