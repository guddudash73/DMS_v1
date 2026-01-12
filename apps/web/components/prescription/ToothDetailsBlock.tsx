'use client';

import type { ToothDetail, ToothPosition } from '@dcm/types';

type Props = {
  toothDetails?: ToothDetail[];
  className?: string;
};

const POS: ToothPosition[] = ['UL', 'UR', 'LL', 'LR'];

const DEBUG_TEETH = false;

function normalizePos(pos: unknown): ToothPosition | null {
  const s = String(pos ?? '')
    .trim()
    .toUpperCase();
  if (s === 'UL' || s === 'UR' || s === 'LL' || s === 'LR') return s as ToothPosition;
  return null;
}

function group(details: ToothDetail[]) {
  const m = new Map<ToothPosition, string[]>();
  for (const p of POS) m.set(p, []);

  for (const d of details) {
    const p = normalizePos(d.position);
    if (!p) continue;

    const arr = m.get(p) ?? [];
    arr.push(...(d.toothNumbers ?? []).map((x) => String(x).trim()).filter(Boolean));
    m.set(p, arr);
  }

  for (const p of POS) {
    const uniq = Array.from(new Set(m.get(p) ?? []));
    uniq.sort((a, b) => a.localeCompare(b));
    m.set(p, uniq);
  }

  return m;
}

export function ToothDetailsBlock({ toothDetails, className }: Props) {
  const clean = (toothDetails ?? []).map((d) => ({
    ...d,
    toothNumbers: (d.toothNumbers ?? []).map((x) => String(x).trim()).filter(Boolean),
    notes: d.notes?.trim() || undefined,
  }));

  const hasAnyTeeth = clean.some((d) => (d.toothNumbers?.length ?? 0) > 0);
  const hasAnyNotes = clean.some((d) => !!d.notes);
  if (!hasAnyTeeth && !hasAnyNotes) return null;

  const byPos = group(clean as ToothDetail[]);

  const uniqueNotes = Array.from(new Set(clean.map((d) => d.notes).filter(Boolean) as string[]));
  const noteText = uniqueNotes.length === 1 ? uniqueNotes[0] : null;

  if (DEBUG_TEETH && typeof window !== 'undefined') {
    globalThis.console.log('[ToothDetailsBlock] raw toothDetails:', toothDetails ?? []);
    globalThis.console.log('[ToothDetailsBlock] clean:', clean);
    globalThis.console.log('[ToothDetailsBlock] grouped:', {
      UL: byPos.get('UL') ?? [],
      UR: byPos.get('UR') ?? [],
      LL: byPos.get('LL') ?? [],
      LR: byPos.get('LR') ?? [],
    });
  }

  return (
    <div className={['flex items-start gap-3', className ?? ''].join(' ')}>
      <div className="relative shrink-0">
        <div className="grid h-11 w-[82px] grid-cols-2 rounded-md bg-white overflow-hidden">
          <div className="flex items-center justify-center border-b border-r border-gray-700 px-1">
            <div className="line-clamp-1 text-[12px] font-semibold text-gray-900">
              {(byPos.get('UL') ?? []).join(', ') || '—'}
            </div>
          </div>

          <div className="flex items-center justify-center border-b border-gray-700 px-1">
            <div className="line-clamp-1 text-[12px] font-semibold text-gray-900">
              {(byPos.get('UR') ?? []).join(', ') || '—'}
            </div>
          </div>

          <div className="flex items-center justify-center border-r border-gray-700 px-1">
            <div className="line-clamp-1 text-[12px] font-semibold text-gray-900">
              {(byPos.get('LL') ?? []).join(', ') || '—'}
            </div>
          </div>

          <div className="flex items-center justify-center px-1">
            <div className="line-clamp-1 text-[12px] font-semibold text-gray-900">
              {(byPos.get('LR') ?? []).join(', ') || '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {noteText ? (
          <div className="truncate text-[12px] font-semibold text-gray-900">{noteText}</div>
        ) : uniqueNotes.length ? (
          <div className="space-y-1">
            {uniqueNotes.map((n, i) => (
              <div key={i} className="truncate text-[12px] font-semibold text-gray-900">
                {n}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-gray-500">—</div>
        )}
      </div>
    </div>
  );
}
