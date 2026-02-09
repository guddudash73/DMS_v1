'use client';

import type { ToothDetail, ToothPosition } from '@dcm/types';

type ToothDetailAny = ToothDetail & {
  blockId?: string;

  // ✅ new fields
  notes?: string;
  diagnosis?: string;

  // existing
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

      // ✅ new
      notes: (anyD as any).notes?.trim() || undefined,
      diagnosis: (anyD as any).diagnosis?.trim() || undefined,

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

function LabeledLines(props: { label: string; lines: string[] }) {
  const { label, lines } = props;
  if (!lines.length) return null;

  return lines.length === 1 ? (
    <div className="min-w-0 whitespace-normal text-[16px] font-semibold text-gray-900 ">
      <span className="text-gray-700">{label}:</span> {lines[0]}
    </div>
  ) : (
    <div className="space-y-1">
      {lines.map((t, i) => (
        <div key={`${label}-${i}`} className="truncate text-[16px] font-semibold text-gray-900">
          <span className="text-gray-700">{label}:</span> {t}
        </div>
      ))}
    </div>
  );
}

function SingleBlockView({ items, className }: { items: ToothDetailAny[]; className?: string }) {
  const hasAnyTeeth = items.some((d) => ((d as any).toothNumbers?.length ?? 0) > 0);

  // ✅ collect unique per-field (block-level)
  const uniqueNotes = uniqStrings(items.map((d) => (d as any).notes));
  const uniqueDiagnosis = uniqStrings(items.map((d) => (d as any).diagnosis));
  const uniqueAdvice = uniqStrings(items.map((d) => (d as any).advice));
  const uniqueProcedure = uniqStrings(items.map((d) => (d as any).procedure));

  const hasAnyText =
    uniqueNotes.length > 0 ||
    uniqueDiagnosis.length > 0 ||
    uniqueAdvice.length > 0 ||
    uniqueProcedure.length > 0;

  if (!hasAnyTeeth && !hasAnyText) return null;

  const byPos = groupTeeth(items);

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
        <div className="grid w-20 grid-cols-2 rounded-md bg-white">
          <div className="flex min-w-0 items-center justify-center border-b border-r border-gray-700 px-2 h-8">
            <div className="whitespace-normal text-[16px] font-semibold text-gray-900">
              {(byPos.get('UL') ?? []).join(', ') || '—'}
            </div>
          </div>

          <div className="flex items-center justify-center border-b border-gray-700 px-1">
            <div className="whitespace-normal text-[16px] font-semibold text-gray-900">
              {(byPos.get('UR') ?? []).join(', ') || '—'}
            </div>
          </div>

          <div className="flex items-center justify-center border-r border-gray-700 px-1">
            <div className="whitespace-normal text-[16px] font-semibold text-gray-900">
              {(byPos.get('LL') ?? []).join(', ') || '—'}
            </div>
          </div>

          <div className="flex items-center justify-center px-1">
            <div className="whitespace-normal text-[16px] font-semibold text-gray-900">
              {(byPos.get('LR') ?? []).join(', ') || '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        {/* ✅ Required order */}
        <LabeledLines label="Notes" lines={uniqueNotes} />
        <LabeledLines label="Diagnosis" lines={uniqueDiagnosis} />
        <LabeledLines label="Advice" lines={uniqueAdvice} />
        <LabeledLines label="Procedure" lines={uniqueProcedure} />

        {!hasAnyText ? <div className="text-[12px] text-gray-500">—</div> : null}
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

    const hasAnyNotes = b.items.some((d) => !!(d as any).notes);
    const hasAnyDiagnosis = b.items.some((d) => !!(d as any).diagnosis);
    const hasAnyAdvice = b.items.some((d) => !!(d as any).advice);
    const hasAnyProcedure = b.items.some((d) => !!(d as any).procedure);

    return hasAnyTeeth || hasAnyNotes || hasAnyDiagnosis || hasAnyAdvice || hasAnyProcedure;
  });

  if (!anyContent) return null;

  return (
    <div className={className ?? ''}>
      <div className="space-y-3">
        {blocks.map((b) => (
          <div key={b.id}>
            <SingleBlockView items={b.items} />
          </div>
        ))}
      </div>
    </div>
  );
}
