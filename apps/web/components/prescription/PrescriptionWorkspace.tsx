// apps/web/components/prescription/PrescriptionWorkspace.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RxLineType } from '@dms/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PrescriptionPreview } from './PrescriptionPreview';
import { PrescriptionPrintSheet } from './PrescriptionPrintSheet';
import { MedicinesEditor } from './MedicinesEditor';
import { useUpsertVisitRxMutation } from '@/src/store/api';

type Props = {
  visitId: string;
  patientName?: string;
  patientPhone?: string;
  doctorName?: string;
  visitDateLabel?: string;
};

export function PrescriptionWorkspace(props: Props) {
  const { visitId, patientName, patientPhone, doctorName, visitDateLabel } = props;

  const [lines, setLines] = useState<RxLineType[]>([]);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastHash = useRef<string>('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [upsert] = useUpsertVisitRxMutation();

  const hash = useMemo(() => JSON.stringify(lines), [lines]);

  useEffect(() => {
    if (lines.length === 0) {
      setState('idle');
      return;
    }
    if (hash === lastHash.current) return;

    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setState('saving');
      try {
        await upsert({ visitId, lines }).unwrap();
        lastHash.current = hash;
        setState('saved');
      } catch {
        setState('error');
      }
    }, 900);

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [hash, lines, upsert, visitId]);

  const statusText =
    state === 'saving'
      ? 'Saving…'
      : state === 'saved'
        ? 'Saved'
        : state === 'error'
          ? 'Save failed'
          : '';

  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-10">
      {/* Left (60%) */}
      <div className="min-w-0 rounded-2xl bg-white p-4 lg:col-span-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold text-gray-900">Prescription</div>
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-gray-500">{statusText}</div>
            <Button
              variant="default"
              className="cursor-pointer rounded-xl"
              onClick={() => window.print()}
            >
              Print
            </Button>
          </div>
        </div>

        <div className="mt-3 min-w-0 overflow-x-hidden">
          <PrescriptionPreview
            patientName={patientName}
            patientPhone={patientPhone}
            doctorName={doctorName}
            visitDateLabel={visitDateLabel}
            lines={lines}
          />
        </div>

        <PrescriptionPrintSheet
          patientName={patientName}
          patientPhone={patientPhone}
          doctorName={doctorName}
          visitDateLabel={visitDateLabel}
          lines={lines}
        />
      </div>

      {/* Right (40%) */}
      <Card className="w-full min-w-0 rounded-2xl border bg-white p-4 lg:col-span-6">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="text-lg font-semibold text-gray-900">Medicines</div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="rounded-xl">
              Upload X-Ray
            </Button>
            <Button type="button" variant="outline" className="rounded-xl">
              Import Preset
            </Button>
          </div>
        </div>

        <div className="min-w-0">
          <MedicinesEditor lines={lines} onChange={setLines} />
        </div>
      </Card>
    </div>
  );
}
