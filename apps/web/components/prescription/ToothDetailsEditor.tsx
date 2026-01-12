'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ToothDetail, ToothPosition } from '@dms/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Trash2 } from 'lucide-react';

type Props = {
  value: ToothDetail[];
  onChange: (next: ToothDetail[]) => void;
  disabled?: boolean;
};

const POSITIONS: ToothPosition[] = ['UL', 'UR', 'LL', 'LR'];

function tokensFromInput(raw: string): string[] {
  const s = (raw ?? '').trim();
  if (!s) return [];

  const parts = s
    .split(/[,\s]+/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 8) break;
  }
  return out;
}

function joinTokens(tokens: string[]) {
  return (tokens ?? []).join(', ');
}

function mapFromValue(value: ToothDetail[]) {
  const byPos: Record<ToothPosition, string[]> = { UL: [], UR: [], LL: [], LR: [] };

  for (const d of value ?? []) {
    if (!d?.position) continue;
    const pos = d.position as ToothPosition;
    byPos[pos] = [...(byPos[pos] ?? []), ...(d.toothNumbers ?? [])].filter(Boolean);
  }

  for (const p of POSITIONS) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of byPos[p] ?? []) {
      const v = String(t).trim();
      if (!v) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
      if (out.length >= 8) break;
    }
    byPos[p] = out;
  }

  const note = (value ?? []).map((d) => d?.notes?.trim()).find((x) => x && x.length > 0) ?? '';
  return { byPos, note };
}

export function ToothDetailsEditor({ value, onChange, disabled }: Props) {
  const [ul, setUl] = useState('');
  const [ur, setUr] = useState('');
  const [ll, setLl] = useState('');
  const [lr, setLr] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const { byPos, note } = mapFromValue(value ?? []);
    setUl(joinTokens(byPos.UL));
    setUr(joinTokens(byPos.UR));
    setLl(joinTokens(byPos.LL));
    setLr(joinTokens(byPos.LR));
    setNotes(note);
  }, [JSON.stringify(value ?? [])]);

  const nextValue = useMemo(() => {
    const byPos: Record<ToothPosition, string[]> = {
      UL: tokensFromInput(ul),
      UR: tokensFromInput(ur),
      LL: tokensFromInput(ll),
      LR: tokensFromInput(lr),
    };

    const cleanedNotes = notes.trim();
    const details: ToothDetail[] = [];

    const positionsWithTokens = POSITIONS.filter((p) => (byPos[p]?.length ?? 0) > 0);
    positionsWithTokens.forEach((p, idx) => {
      details.push({
        position: p,
        toothNumbers: byPos[p],
        ...(cleanedNotes && idx === 0 ? { notes: cleanedNotes } : {}),
      } as ToothDetail);
    });

    return details;
  }, [ul, ur, ll, lr, notes]);

  const hasAnything = useMemo(() => (nextValue?.length ?? 0) > 0, [nextValue]);

  const commit = () => {
    if (disabled) return;
    onChange(nextValue);
  };

  const clearAll = () => {
    if (disabled) return;
    setUl('');
    setUr('');
    setLl('');
    setLr('');
    setNotes('');
    onChange([]);
  };

  const tinyInput =
    'h-7 w-full rounded-none border-0 bg-transparent px-1 text-center text-[12px] font-semibold leading-none text-gray-900 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0';

  return (
    <div className="w-full overflow-hidden rounded-xl border bg-white">
      <div className="bg-white px-3 py-3">
        <div className="mb-2 text-sm font-semibold text-gray-900">Teeth</div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="shrink-0">
            <div className="inline-block overflow-hidden rounded-[6px] border border-gray-400">
              <div className="grid grid-cols-2">
                <div className="border-b border-r border-gray-700">
                  <Input
                    disabled={disabled}
                    value={ul}
                    onChange={(e) => setUl(e.target.value)}
                    placeholder=""
                    className={tinyInput}
                  />
                </div>

                <div className="border-b border-gray-700">
                  <Input
                    disabled={disabled}
                    value={ur}
                    onChange={(e) => setUr(e.target.value)}
                    placeholder=""
                    className={tinyInput}
                  />
                </div>

                <div className="border-r border-gray-700">
                  <Input
                    disabled={disabled}
                    value={ll}
                    onChange={(e) => setLl(e.target.value)}
                    placeholder=""
                    className={tinyInput}
                  />
                </div>

                <div>
                  <Input
                    disabled={disabled}
                    value={lr}
                    onChange={(e) => setLr(e.target.value)}
                    placeholder=""
                    className={tinyInput}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[11px] font-semibold text-gray-700">Notes (single)</div>
            <Textarea
              disabled={disabled}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[38px] resize-none rounded-xl"
              placeholder="Optional notes…"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            className="rounded-xl"
            disabled={disabled}
            onClick={commit}
            title={hasAnything ? 'Save teeth details' : 'Nothing to save'}
          >
            Save Teeth
          </Button>

          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={disabled}
            onClick={clearAll}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>

          <div className="ml-auto text-[11px] text-gray-500">
            Stored: {hasAnything ? `${nextValue.length} quadrant(s)` : '—'}
          </div>
        </div>
      </div>

      <div className="border-t px-3 py-2 text-sm">
        {value?.length ? (
          <div className="text-gray-700">
            Current:{' '}
            {POSITIONS.map((p) => {
              const row = (value ?? []).find((d) => d.position === p);
              const txt = row?.toothNumbers?.length ? row.toothNumbers.join(', ') : '—';
              return (
                <span key={p} className="mr-3">
                  <span className="font-semibold">{p}</span>: {txt}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="text-gray-500">No teeth details saved yet.</div>
        )}
      </div>
    </div>
  );
}
