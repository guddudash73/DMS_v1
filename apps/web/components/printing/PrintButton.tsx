'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { TokenPrintPayload } from '@dms/types';
import { buildTokenEscPos } from '@/src/lib/printing/escpos';
import { loadPrintSettings } from '@/src/lib/printing/settings';
import { printRaw } from '@/src/lib/printing/qz';
import { toast } from 'react-toastify';

export function PrintTokenButton({ token }: { token: TokenPrintPayload }) {
  const [busy, setBusy] = React.useState(false);

  const onPrint = async () => {
    const settings = loadPrintSettings();
    if (!settings.printerName) {
      toast.error('No printer selected. Go to Settings → Printer.');
      return;
    }

    try {
      setBusy(true);
      const raw = buildTokenEscPos(token);
      await printRaw(settings.printerName, raw);
      toast.success('Token printed.');
    } catch (e) {
      console.error(e);
      toast.error('Token print failed. Is QZ Tray running?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={onPrint} disabled={busy}>
      {busy ? 'Printing…' : 'Print token'}
    </Button>
  );
}
