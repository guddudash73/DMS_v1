'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useGetXrayUrlQuery } from '@/src/store/api';

type Props = {
  xrayId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function XrayViewerModal({ xrayId, open, onOpenChange }: Props) {
  const [activeId, setActiveId] = useState<string | null>(xrayId);

  useEffect(() => {
    if (open) setActiveId(xrayId);
  }, [open, xrayId]);

  const { data, isFetching, isError } = useGetXrayUrlQuery(
    { xrayId: activeId ?? '', size: 'original' },
    { skip: !open || !activeId },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>X-ray Viewer</DialogTitle>
        </DialogHeader>

        <div className="relative w-full overflow-hidden rounded-xl border bg-white">
          <div className="flex min-h-[420px] items-center justify-center p-4">
            {isFetching && <div className="text-sm text-gray-500">Loading…</div>}
            {isError && <div className="text-sm text-red-600">Failed to load image.</div>}
            {data?.url && (
              <Image
                src={data.url}
                alt="X-ray"
                width={1200}
                height={900}
                className="h-auto w-full object-contain"
                unoptimized
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
