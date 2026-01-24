'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ToothDetail, ToothPosition } from '@dcm/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type ToothDetailAny = ToothDetail & {
  blockId?: string;
  advice?: string;
  procedure?: string;
};

type ToothEditorProps = {
  value: ToothDetail[];
  onChange: (next: ToothDetail[]) => void;
  disabled?: boolean;

  /**
   * Optional: when used inside MultiToothDetailsEditor,
   * every saved entry gets this blockId.
   */
  blockId?: string;

  /**
   * Per-block remove (provided by MultiToothDetailsEditor)
   * If present, editor shows "Remove" button next to Save.
   */
  onRemove?: () => void;

  /**
   * Optional label shown on the left (e.g. Teeth Detail 1)
   */
  title?: string;

  /**
   * Autosave debounce ms (optional)
   */
  autosaveMs?: number;
};

const POSITIONS: ToothPosition[] = ['UL', 'UR', 'LL', 'LR'];

function newId() {
  return `td_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

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
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= 8) break;
  }
  return out;
}

function joinTokens(tokens: string[]) {
  return (tokens ?? []).join(', ');
}

function firstNonEmptyTrimmed(values: Array<string | undefined | null>) {
  return values.map((x) => x?.trim()).find((x) => x && x.length > 0) ?? '';
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

  const advice = firstNonEmptyTrimmed((value ?? []).map((d) => (d as any)?.advice));
  const procedure = firstNonEmptyTrimmed((value ?? []).map((d) => (d as any)?.procedure));

  return { byPos, advice, procedure };
}

function normalize(items: ToothDetail[]): ToothDetailAny[] {
  return (items ?? []).map((d) => {
    const anyD = d as ToothDetailAny;
    return {
      ...anyD,
      blockId: (anyD as any).blockId ? String((anyD as any).blockId) : undefined,
      advice: (anyD as any).advice?.trim() || undefined,
      procedure: (anyD as any).procedure?.trim() || undefined,
      toothNumbers: ((anyD as any).toothNumbers ?? [])
        .map((x: any) => String(x).trim())
        .filter(Boolean),
    };
  });
}

function applyBlockId(items: ToothDetailAny[], id: string): ToothDetailAny[] {
  return items.map((d) => ({ ...(d as any), blockId: id }));
}

function stableKey(details: ToothDetail[]) {
  const posIndex = new Map<ToothPosition, number>([
    ['UL', 0],
    ['UR', 1],
    ['LL', 2],
    ['LR', 3],
  ]);

  const normalized = (details ?? []).map((d: any) => ({
    position: d?.position ?? null,
    toothNumbers: (d?.toothNumbers ?? []).map((x: any) => String(x).trim()).filter(Boolean),
    advice: typeof d?.advice === 'string' ? d.advice.trim() : '',
    procedure: typeof d?.procedure === 'string' ? d.procedure.trim() : '',
    blockId: typeof d?.blockId === 'string' ? d.blockId : '',
  }));

  normalized.sort((a, b) => {
    const pa = posIndex.get(a.position as ToothPosition) ?? 99;
    const pb = posIndex.get(b.position as ToothPosition) ?? 99;
    if (pa !== pb) return pa - pb;

    const ta = a.toothNumbers.join(',');
    const tb = b.toothNumbers.join(',');
    return ta.localeCompare(tb);
  });

  return JSON.stringify(normalized);
}

/**
 * ✅ Minimal single editor
 * - Save + Remove per block
 * - Status: Unsaved changes (red) / Saved (green)
 * - Autosave with debounce
 */
export function ToothDetailsEditor({
  value,
  onChange,
  disabled,
  blockId,
  onRemove,
  title,
  autosaveMs = 800,
}: ToothEditorProps) {
  const inferredBlockId = useMemo(() => {
    const v0: any = (value ?? [])[0];
    return typeof v0?.blockId === 'string' && v0.blockId.trim() ? v0.blockId : undefined;
  }, [value]);

  const effectiveBlockId = blockId ?? inferredBlockId;

  const [ul, setUl] = useState('');
  const [ur, setUr] = useState('');
  const [ll, setLl] = useState('');
  const [lr, setLr] = useState('');
  const [advice, setAdvice] = useState('');
  const [procedure, setProcedure] = useState('');

  // prevent effect overwrite while we’re actively autosaving
  const isSavingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // If the parent updates (saved), reflect it in UI
    // But avoid fighting with an in-flight autosave tick
    if (isSavingRef.current) return;

    const { byPos, advice: a, procedure: p } = mapFromValue(value ?? []);
    setUl(joinTokens(byPos.UL));
    setUr(joinTokens(byPos.UR));
    setLl(joinTokens(byPos.LL));
    setLr(joinTokens(byPos.LR));
    setAdvice(a);
    setProcedure(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value ?? [])]);

  const nextValue = useMemo(() => {
    const byPos: Record<ToothPosition, string[]> = {
      UL: tokensFromInput(ul),
      UR: tokensFromInput(ur),
      LL: tokensFromInput(ll),
      LR: tokensFromInput(lr),
    };

    const cleanedAdvice = advice.trim();
    const cleanedProcedure = procedure.trim();

    const details: ToothDetail[] = [];
    const positionsWithTokens = POSITIONS.filter((p) => (byPos[p]?.length ?? 0) > 0);

    positionsWithTokens.forEach((p, idx) => {
      details.push({
        position: p,
        toothNumbers: byPos[p],
        ...(effectiveBlockId ? { blockId: effectiveBlockId } : {}),
        ...(cleanedAdvice && idx === 0 ? { advice: cleanedAdvice } : {}),
        ...(cleanedProcedure && idx === 0 ? { procedure: cleanedProcedure } : {}),
      } as ToothDetail);
    });

    return details;
  }, [ul, ur, ll, lr, advice, procedure, effectiveBlockId]);

  const savedKey = useMemo(() => stableKey(value ?? []), [value]);
  const draftKey = useMemo(() => stableKey(nextValue ?? []), [nextValue]);
  const isDirty = savedKey !== draftKey;

  const hasAnything = (nextValue?.length ?? 0) > 0;

  const commit = () => {
    if (disabled) return;
    isSavingRef.current = true;
    try {
      onChange(nextValue);
    } finally {
      // allow next parent update to sync UI
      setTimeout(() => {
        isSavingRef.current = false;
      }, 0);
    }
  };

  // ✅ Autosave with debounce on any field changes (only if dirty)
  useEffect(() => {
    if (disabled) return;
    if (!isDirty) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // autosave even if empty; but only when dirty (so it’s meaningful)
      isSavingRef.current = true;
      try {
        onChange(nextValue);
      } finally {
        setTimeout(() => {
          isSavingRef.current = false;
        }, 0);
      }
    }, autosaveMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [disabled, isDirty, autosaveMs, nextValue, onChange]);

  const statusNode = isDirty ? (
    <span className="text-[11px] font-semibold text-red-600">Unsaved changes</span>
  ) : (
    <span className="text-[11px] font-semibold text-green-600">Saved</span>
  );

  const tinyInput =
    'h-7 w-full rounded-none border-0 bg-transparent px-1 text-center text-[12px] font-semibold leading-none text-gray-900 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0';

  return (
    <div className="w-full rounded-xl bg-white p-3">
      {/* Header row: Title (left) + Status + Actions (right) */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-gray-900">{title ?? 'Teeth'}</div>

        <div className="flex items-center gap-2">
          {/* ✅ status just before Remove */}
          {statusNode}

          {onRemove ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-lg px-3 text-xs cursor-pointer"
              disabled={disabled}
              onClick={onRemove}
              title="Remove this teeth detail"
            >
              Remove
            </Button>
          ) : null}

          <Button
            type="button"
            className="h-8 rounded-lg px-3 text-xs cursor-pointer"
            disabled={disabled || !hasAnything}
            onClick={commit}
            title={hasAnything ? 'Save teeth details' : 'Nothing to save'}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* compact 2x2 grid */}
        <div className="shrink-0">
          <div className="inline-block w-28 overflow-hidden rounded-[6px] border border-gray-400">
            <div className="grid grid-cols-2">
              <div className="border-b border-r border-gray-700">
                <Input
                  disabled={disabled}
                  value={ul}
                  onChange={(e) => setUl(e.target.value)}
                  className={tinyInput}
                />
              </div>

              <div className="border-b border-gray-700">
                <Input
                  disabled={disabled}
                  value={ur}
                  onChange={(e) => setUr(e.target.value)}
                  className={tinyInput}
                />
              </div>

              <div className="border-r border-gray-700">
                <Input
                  disabled={disabled}
                  value={ll}
                  onChange={(e) => setLl(e.target.value)}
                  className={tinyInput}
                />
              </div>

              <div>
                <Input
                  disabled={disabled}
                  value={lr}
                  onChange={(e) => setLr(e.target.value)}
                  className={tinyInput}
                />
              </div>
            </div>
          </div>
        </div>

        {/* compact advice/procedure */}
        <div className="min-w-0 w-full">
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-semibold text-gray-700">Advice</div>
              <Textarea
                disabled={disabled}
                value={advice}
                onChange={(e) => setAdvice(e.target.value)}
                className="min-h-[38px] w-full resize-none rounded-lg"
                placeholder="—"
                maxLength={500}
              />
            </div>

            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-semibold text-gray-700">Procedure</div>
              <Textarea
                disabled={disabled}
                value={procedure}
                onChange={(e) => setProcedure(e.target.value)}
                className="min-h-[38px] w-full resize-none rounded-lg"
                placeholder="—"
                maxLength={500}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ✅ Multi block editor (SAME FILE)
 */
type MultiProps = {
  value: ToothDetail[];
  onChange: (next: ToothDetail[]) => void;
  disabled?: boolean;
};

export function MultiToothDetailsEditor({ value, onChange, disabled }: MultiProps) {
  const normalized = useMemo(() => normalize(value ?? []), [value]);

  const itemsByBlock = useMemo(() => {
    const map = new Map<string, ToothDetailAny[]>();
    for (const d of normalized) {
      const id = (d.blockId ?? 'default') as string;
      map.set(id, [...(map.get(id) ?? []), d]);
    }
    return map;
  }, [normalized]);

  const [blockIds, setBlockIds] = useState<string[]>(['default']);

  useEffect(() => {
    const fromValue = Array.from(itemsByBlock.keys());

    if (fromValue.length === 0) {
      setBlockIds((prev) => (prev.length ? prev : ['default']));
      return;
    }

    setBlockIds((prev) => {
      const merged = new Set<string>(prev);
      for (const id of fromValue) merged.add(id);

      const next = Array.from(merged);
      next.sort((a, b) => {
        if (a === 'default') return -1;
        if (b === 'default') return 1;
        return a.localeCompare(b);
      });
      return next;
    });
  }, [itemsByBlock]);

  const addBlock = () => {
    const id = newId();
    setBlockIds((prev) => {
      const next = [...prev, id];
      next.sort((a, b) => {
        if (a === 'default') return -1;
        if (b === 'default') return 1;
        return a.localeCompare(b);
      });
      return next;
    });
  };

  const removeBlock = (id: string) => {
    setBlockIds((prev) => prev.filter((x) => x !== id));
    const remaining = normalized.filter((d) => ((d.blockId ?? 'default') as string) !== id);
    onChange(remaining as any);
  };

  const updateBlock = (id: string, updatedBlockItems: ToothDetail[]) => {
    const updated = applyBlockId(normalize(updatedBlockItems), id);
    const others = normalized.filter((d) => ((d.blockId ?? 'default') as string) !== id);

    const nextById = new Map<string, ToothDetailAny[]>();
    for (const bid of blockIds) nextById.set(bid, []);

    for (const o of others) {
      const bid = (o.blockId ?? 'default') as string;
      nextById.set(bid, [...(nextById.get(bid) ?? []), o]);
    }

    nextById.set(id, updated);

    const flattened: ToothDetailAny[] = [];
    for (const bid of blockIds) flattened.push(...(nextById.get(bid) ?? []));

    onChange(flattened as any);
  };

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-semibold text-gray-900">Teeth</div>

        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-xl px-3 cursor-pointer"
          onClick={addBlock}
          disabled={disabled}
        >
          + Add
        </Button>
      </div>

      <div className="space-y-0">
        {blockIds.length === 0 ? (
          <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-600">
            No teeth details added.
          </div>
        ) : (
          blockIds.map((id, idx) => {
            const items = itemsByBlock.get(id) ?? [];

            return (
              <div key={id} className="rounded-2xl bg-white">
                <ToothDetailsEditor
                  title={`Teeth Detail ${idx + 1}`}
                  value={items as any}
                  blockId={id}
                  onChange={(next) => updateBlock(id, next)}
                  disabled={disabled}
                  onRemove={() => removeBlock(id)}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
