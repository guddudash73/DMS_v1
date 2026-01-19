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
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="mx-auto flex w-full max-w-300 flex-col gap-6 2xl:gap-10">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
          <div className="mt-1 text-xs text-gray-500">Configure printing and token behavior.</div>
        </div>

        <Card className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  Auto-print token on Visit creation
                </div>
              </div>
              <Switch
                checked={autoPrintToken}
                onCheckedChange={setAutoPrintToken}
                className="cursor-pointer"
              />
            </div>

            <div className="h-px w-full bg-gray-100" />

            <div className="flex flex-col gap-3">
              <div>
                <div className="text-sm font-medium text-gray-900">Receipt printer</div>
                <div className="mt-1 text-xs text-gray-500">
                  Printer must be visible to QZ Tray (USB or network).
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={refreshPrinters}
                  disabled={busy}
                  className="cursor-pointer"
                >
                  {busy ? 'Loading…' : 'Detect printers'}
                </Button>
                <Button type="button" onClick={save} disabled={busy} className="cursor-pointer">
                  Save
                </Button>
              </div>

              <select
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm cursor-pointer"
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
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
