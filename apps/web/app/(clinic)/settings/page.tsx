'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { loadPrintSettings, savePrintSettings } from '@/src/lib/printing/settings';
import { listPrinters } from '@/src/lib/printing/qz';
import { toast } from 'react-toastify';

export default function SettingPage() {
  const [autoPrintToken, setAutoPrintToken] = React.useState(true);
  const [printerName, setPrinterName] = React.useState<string>('');
  const [printers, setPrinters] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const s = loadPrintSettings();
    setAutoPrintToken(s.autoPrintToken ?? true);
    setPrinterName(s.printerName ?? '');
  }, []);

  const refreshPrinters = async () => {
    try {
      setBusy(true);
      const items = await listPrinters();
      setPrinters(items);
      toast.success('Printers loaded from QZ Tray.');
    } catch (e) {
      console.error(e);
      toast.error('Unable to load printers. Is QZ Tray installed & running?');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    savePrintSettings({ autoPrintToken, printerName: printerName || undefined });
    toast.success('Print settings saved.');
  };

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card className="rounded-2xl border bg-white p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Auto-print token on Visit creation</div>
            <div className="text-xs text-gray-500">Requires QZ Tray on the reception PC.</div>
          </div>
          <Switch checked={autoPrintToken} onCheckedChange={setAutoPrintToken} />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Receipt printer</div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={refreshPrinters} disabled={busy}>
              {busy ? 'Loading…' : 'Detect printers'}
            </Button>
            <Button type="button" onClick={save}>
              Save
            </Button>
          </div>

          <select
            className="mt-2 h-10 w-full rounded-xl border bg-white px-3 text-sm"
            value={printerName}
            onChange={(e) => setPrinterName(e.target.value)}
          >
            <option value="">Select printer…</option>
            {printers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <p className="text-xs text-gray-500">
            Printer must be visible to QZ Tray (USB or network).
          </p>
        </div>
      </Card>
    </section>
  );
}
