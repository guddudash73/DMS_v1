'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { toast } from 'react-toastify';
import { Trash2 } from 'lucide-react';
import { useListVisitXraysQuery, useGetXrayUrlQuery, useDeleteXrayMutation } from '@/src/store/api';
import { XrayViewerModal } from './XrayViewerModal';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CLINIC_TZ } from '@/src/lib/clinicTime';

type Props = {
  visitId: string;

  variant?: 'embedded' | 'standalone';

  canDelete?: boolean;
};

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

function getErrorMessage(err: unknown): string | undefined {
  if (!err) return undefined;

  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const msg = e.message;
    if (typeof msg === 'string' && msg.trim()) return msg;

    const data = e.data;
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      const dm = d.message;
      if (typeof dm === 'string' && dm.trim()) return dm;
    }
  }

  return undefined;
}

function Thumb({ xrayId }: { xrayId: string }) {
  const { data } = useGetXrayUrlQuery({ xrayId, size: 'thumb' });
  if (!data?.url) return <div className="h-18 w-18 rounded-xl bg-gray-100" />;

  return (
    <Image
      src={data.url}
      alt="X-ray thumb"
      width={160}
      height={160}
      className="h-18 w-18 cursor-pointer rounded-xl object-cover"
      unoptimized
    />
  );
}

export function XrayGallery({ visitId, variant = 'standalone', canDelete = true }: Props) {
  const { data, isLoading, isError, refetch } = useListVisitXraysQuery({ visitId });
  const items = data?.items ?? [];

  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [deleteXray, deleteState] = useDeleteXrayMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const empty = useMemo(
    () => !isLoading && !isError && items.length === 0,
    [isLoading, isError, items.length],
  );

  const openViewer = (xrayId: string) => {
    setActiveId(xrayId);
    setViewerOpen(true);
  };

  const openDeleteConfirm = (xrayId: string) => {
    setPendingDeleteId(xrayId);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;

    try {
      await deleteXray({ visitId, xrayId: pendingDeleteId }).unwrap();

      if (activeId === pendingDeleteId) {
        setViewerOpen(false);
        setActiveId(null);
      }

      toast.success('X-ray deleted.');
      setConfirmOpen(false);
      setPendingDeleteId(null);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) ?? 'Failed to delete X-ray.');
    }
  };

  return (
    <div className={variant === 'embedded' ? 'rounded-xl border bg-white p-3' : 'space-y-3'}>
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
            <div
              key={x.xrayId}
              className="group relative rounded-2xl border bg-white p-2 pb-4 transition hover:shadow-sm"
            >
              <button
                type="button"
                className="relative block rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                onClick={() => openViewer(x.xrayId)}
                aria-label="Open X-ray"
              >
                <Thumb xrayId={x.xrayId} />
              </button>

              {canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute bottom-0 right-0 h-8 w-8 cursor-pointer rounded-2xl"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openDeleteConfirm(x.xrayId);
                  }}
                  aria-label="Delete X-ray"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}

              <div className="mt-2 text-left">
                <div className="text-[11px] font-medium text-gray-800">
                  {formatClinicDateTime(x.takenAt)}
                </div>
                <div className="text-[10px] text-gray-500">{Math.round(x.size / 1024)} KB</div>
              </div>
            </div>
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

      {canDelete ? (
        <Dialog
          open={confirmOpen}
          onOpenChange={(open) => {
            setConfirmOpen(open);
            if (!open) setPendingDeleteId(null);
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete X-ray?</DialogTitle>
            </DialogHeader>

            <div className="text-sm text-gray-600">
              This will permanently delete the X-ray for this visit. You can’t undo this action.
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                onClick={() => setConfirmOpen(false)}
                disabled={deleteState.isLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="rounded-xl"
                onClick={() => void confirmDelete()}
                disabled={deleteState.isLoading}
              >
                {deleteState.isLoading ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
