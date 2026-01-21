'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const XrayTrayReadOnly = dynamic(
  () => import('@/components/xray/XrayTrayReadOnly').then((m) => m.XrayTrayReadOnly),
  { ssr: false },
);

export function VisitXrayQuickLookDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: string | null;
}) {
  const { open, onOpenChange, visitId } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>X-rays</DialogTitle>
        </DialogHeader>
        {!visitId ? null : <XrayTrayReadOnly visitId={visitId} />}
      </DialogContent>
    </Dialog>
  );
}
