'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useGetXrayUrlQuery, useListVisitXraysQuery } from '@/src/store/api';
import { XrayViewerModal } from './XrayViewerModal';
import { CLINIC_TZ } from '@/src/lib/clinicTime';

function formatClinicDateTime(ts: number | string) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: CLINIC_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

function useInView<T extends Element>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      if (e.isIntersecting) setInView(true);
    }, options);

    obs.observe(el);
    return () => obs.disconnect();
  }, [options]);

  return { ref, inView };
}

function Thumb({ xrayId, enabled }: { xrayId: string; enabled: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: '250px' });

  const shouldFetch = enabled && inView;

  const { data } = useGetXrayUrlQuery({ xrayId, size: 'thumb' }, { skip: !shouldFetch });

  return (
    <div ref={ref} className="h-18 w-18">
      {!data?.url ? (
        <div className="h-18 w-18 rounded-xl bg-gray-100" />
      ) : (
        <Image
          src={data.url}
          alt="X-ray thumb"
          width={160}
          height={160}
          className="h-18 w-18 rounded-xl object-cover"
          unoptimized
        />
      )}
    </div>
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

  // ✅ Defer all thumb URL calls until after initial paint / idle time
  const [thumbsEnabled, setThumbsEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const enable = () => {
      if (cancelled) return;
      setThumbsEnabled(true);
    };

    // prefer idle time, fallback to small timeout
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;

    if (typeof ric === 'function') {
      const id = ric(enable, { timeout: 800 });
      return () => {
        cancelled = true;
        const cancel = (window as any).cancelIdleCallback as ((id: number) => void) | undefined;
        cancel?.(id);
      };
    }

    const t = window.setTimeout(enable, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [visitId]);

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
              <Thumb xrayId={x.xrayId} enabled={thumbsEnabled} />
              <div className="mt-2 text-left">
                <div className="text-[11px] font-medium text-gray-800">
                  {formatClinicDateTime(x.takenAt)}
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
