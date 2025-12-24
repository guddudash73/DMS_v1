// apps/web/components/prescription/PrescriptionWorkspace.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RxLineType } from '@dms/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PrescriptionPreview } from './PrescriptionPreview';
import { PrescriptionPrintSheet } from './PrescriptionPrintSheet';
import { MedicinesEditor } from './MedicinesEditor';
import {
  useUpsertVisitRxMutation,
  useGetVisitRxQuery,
  useStartVisitRxRevisionMutation,
  useUpdateRxByIdMutation,
} from '@/src/store/api';

type Props = {
  visitId: string;
  patientName?: string;
  patientPhone?: string;
  doctorName?: string;
  visitDateLabel?: string;
  visitStatus?: 'QUEUED' | 'IN_PROGRESS' | 'DONE';
};

export function PrescriptionWorkspace(props: Props) {
  const { visitId, patientName, patientPhone, doctorName, visitDateLabel, visitStatus } = props;

  const [lines, setLines] = useState<RxLineType[]>([]);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [activeRxId, setActiveRxId] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  const lastHash = useRef<string>('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: !visitId });
  const [upsert] = useUpsertVisitRxMutation();
  const [startRevision, startRevisionState] = useStartVisitRxRevisionMutation();
  const [updateRxById] = useUpdateRxByIdMutation();

  // Hydrate from server once
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!rxQuery.isSuccess) return;

    const rx = rxQuery.data?.rx ?? null;
    if (rx) {
      setLines(rx.lines ?? []);
      setActiveRxId(rx.rxId);
      const h = JSON.stringify(rx.lines ?? []);
      lastHash.current = h;
    } else {
      setLines([]);
      setActiveRxId(null);
      lastHash.current = JSON.stringify([]);
    }

    hydratedRef.current = true;
    setState('idle');
  }, [rxQuery.isSuccess, rxQuery.data]);

  const hash = useMemo(() => JSON.stringify(lines), [lines]);

  const canAutosave =
    hydratedRef.current &&
    lines.length > 0 &&
    hash !== lastHash.current &&
    (visitStatus !== 'DONE' || !!activeRxId); // DONE requires activeRxId (from revision or existing)

  useEffect(() => {
    if (!canAutosave) return;

    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setState('saving');
      try {
        if (visitStatus === 'DONE') {
          // ✅ update existing version (revision must have been started and set activeRxId)
          await updateRxById({ rxId: activeRxId!, lines }).unwrap();
        } else {
          // ✅ upsert draft (same rxId for the visit)
          const res = await upsert({ visitId, lines }).unwrap();
          setActiveRxId(res.rxId);
        }

        lastHash.current = hash;
        setState('saved');
      } catch {
        setState('error');
      }
    }, 900);

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [canAutosave, hash, lines, visitId, visitStatus, activeRxId, upsert, updateRxById]);

  const statusText =
    state === 'saving'
      ? 'Saving…'
      : state === 'saved'
        ? 'Saved'
        : state === 'error'
          ? 'Save failed'
          : '';

  const showStartRevision = visitStatus === 'DONE';

  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-10">
      <div className="min-w-0 rounded-2xl bg-white p-4 lg:col-span-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold text-gray-900">Prescription</div>
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-gray-500">{statusText}</div>

            {showStartRevision ? (
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={startRevisionState.isLoading}
                onClick={async () => {
                  try {
                    const res = await startRevision({ visitId }).unwrap();
                    setActiveRxId(res.rxId);
                    // after revision start, autosave uses PUT /rx/:rxId
                    setState('idle');
                  } catch {
                    setState('error');
                  }
                }}
              >
                Start Revision
              </Button>
            ) : null}

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
