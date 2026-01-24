'use client';

import type { ToothDetail, ToothPosition } from '@dcm/types';

type ToothDetailAny = ToothDetail & {
  blockId?: string;
  advice?: string;
  procedure?: string;
};

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

function uniqStrings(vals: Array<string | undefined | null>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of vals) {
    const s = (v ?? '').trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function groupTeeth(details: ToothDetailAny[]) {
  const m = new Map<ToothPosition, string[]>();
  for (const p of POS) m.set(p, []);

  for (const d of details) {
    const p = normalizePos((d as any).position);
    if (!p) continue;

    const arr = m.get(p) ?? [];
    arr.push(...((d as any).toothNumbers ?? []).map((x: any) => String(x).trim()).filter(Boolean));
    m.set(p, arr);
  }

  for (const p of POS) {
    const uniq = Array.from(new Set(m.get(p) ?? []));
    uniq.sort((a, b) => a.localeCompare(b));
    m.set(p, uniq);
  }

  return m;
}

function cleanDetails(input: ToothDetail[]): ToothDetailAny[] {
  return (input ?? []).map((d) => {
    const anyD = d as ToothDetailAny;

    return {
      ...anyD,
      toothNumbers: ((anyD as any).toothNumbers ?? [])
        .map((x: any) => String(x).trim())
        .filter(Boolean),
      advice: (anyD as any).advice?.trim() || undefined,
      procedure: (anyD as any).procedure?.trim() || undefined,
      blockId: (anyD as any).blockId ? String((anyD as any).blockId) : undefined,
    };
  });
}

function splitByBlockId(details: ToothDetailAny[]) {
  // If no blockId exists, treat everything as a single block ("default")
  const hasAnyBlockId = details.some((d) => !!d.blockId);
  const getId = (d: ToothDetailAny) => (hasAnyBlockId ? (d.blockId ?? 'default') : 'default');

  const map = new Map<string, ToothDetailAny[]>();
  for (const d of details) {
    const id = getId(d);
    map.set(id, [...(map.get(id) ?? []), d]);
  }

  // stable ordering: default first, then by key
  const ids = Array.from(map.keys());
  ids.sort((a, b) => {
    if (a === 'default') return -1;
    if (b === 'default') return 1;
    return a.localeCompare(b);
  });

  return ids.map((id) => ({ id, items: map.get(id) ?? [] }));
}

function SingleBlockView({ items, className }: { items: ToothDetailAny[]; className?: string }) {
  const hasAnyTeeth = items.some((d) => ((d as any).toothNumbers?.length ?? 0) > 0);
  const uniqueAdvice = uniqStrings(items.map((d) => (d as any).advice));
  const uniqueProcedure = uniqStrings(items.map((d) => (d as any).procedure));

  const hasAnyAdvice = uniqueAdvice.length > 0;
  const hasAnyProcedure = uniqueProcedure.length > 0;

  if (!hasAnyTeeth && !hasAnyAdvice && !hasAnyProcedure) return null;

  const byPos = groupTeeth(items);

  const adviceText = uniqueAdvice.length === 1 ? uniqueAdvice[0] : null;
  const procedureText = uniqueProcedure.length === 1 ? uniqueProcedure[0] : null;

  if (DEBUG_TEETH && typeof window !== 'undefined') {
    globalThis.console.log('[ToothDetailsBlock] items:', items);
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
        <div className="grid h-11 w-20.5 grid-cols-2 overflow-hidden rounded-md bg-white">
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

      <div className="min-w-0 flex-1 space-y-1">
        {adviceText ? (
          <div className="truncate text-[12px] font-semibold text-gray-900">
            <span className="text-gray-700">Advice:</span> {adviceText}
          </div>
        ) : uniqueAdvice.length ? (
          <div className="space-y-1">
            {uniqueAdvice.map((n, i) => (
              <div key={`a-${i}`} className="truncate text-[12px] font-semibold text-gray-900">
                <span className="text-gray-700">Advice:</span> {n}
              </div>
            ))}
          </div>
        ) : null}

        {procedureText ? (
          <div className="truncate text-[12px] font-semibold text-gray-900">
            <span className="text-gray-700">Procedure:</span> {procedureText}
          </div>
        ) : uniqueProcedure.length ? (
          <div className="space-y-1">
            {uniqueProcedure.map((n, i) => (
              <div key={`p-${i}`} className="truncate text-[12px] font-semibold text-gray-900">
                <span className="text-gray-700">Procedure:</span> {n}
              </div>
            ))}
          </div>
        ) : null}

        {!uniqueAdvice.length && !uniqueProcedure.length ? (
          <div className="text-[12px] text-gray-500">—</div>
        ) : null}
      </div>
    </div>
  );
}

export function ToothDetailsBlock({ toothDetails, className }: Props) {
  const clean = cleanDetails(toothDetails ?? []);
  const blocks = splitByBlockId(clean);

  // If everything is empty, show nothing
  const anyContent = blocks.some((b) => {
    const hasAnyTeeth = b.items.some((d) => ((d as any).toothNumbers?.length ?? 0) > 0);
    const hasAnyAdvice = b.items.some((d) => !!(d as any).advice);
    const hasAnyProcedure = b.items.some((d) => !!(d as any).procedure);
    return hasAnyTeeth || hasAnyAdvice || hasAnyProcedure;
  });

  if (!anyContent) return null;

  return (
    <div className={className ?? ''}>
      <div className="space-y-3">
        {blocks.map((b, idx) => (
          <div key={b.id}>
            <SingleBlockView items={b.items} />
          </div>
        ))}
      </div>
    </div>
  );
}
