'use client';

import * as React from 'react';
import type { RxLineType, PrescriptionPreset, RxPresetFilter } from '@dms/types';
import { useGetRxPresetsQuery } from '@/src/store/api';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { Check, Search, Sparkles } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  disabled?: boolean;

  append?: boolean;

  existingCount?: number;

  onImport: (lines: RxLineType[]) => void;
};

function scopeBadge(scope?: string) {
  if (scope === 'ADMIN') return { label: 'Admin', className: 'bg-gray-900 text-white' };
  if (scope === 'PUBLIC') return { label: 'Public', className: 'bg-emerald-600 text-white' };
  return { label: 'Private', className: 'bg-slate-100 text-slate-700 border border-slate-200' };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getValue(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

function getString(obj: unknown, key: string): string | undefined {
  const val = getValue(obj, key);
  if (val == null) return undefined;
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return undefined;
}

function getNumberLike(obj: unknown, key: string): number | undefined {
  const val = getValue(obj, key);
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && Number.isFinite(Number(val))) return Number(val);
  return undefined;
}

function getStringArray(obj: unknown, key: string): string[] | undefined {
  const val = getValue(obj, key);
  if (!Array.isArray(val)) return undefined;
  const out = val.filter((x) => typeof x === 'string') as string[];
  return out.length ? out : undefined;
}

function normalizePresetLines(lines: unknown[]): RxLineType[] {
  return (lines ?? [])
    .map((lUnknown) => {
      const medicine = (
        getString(lUnknown, 'medicine') ??
        getString(lUnknown, 'medicineName') ??
        ''
      )
        .toString()
        .trim();

      if (!medicine) return null;

      const dose = (getString(lUnknown, 'dose') ?? '').toString().trim();

      const frequencyRaw = getValue(lUnknown, 'frequency');
      const frequency: RxLineType['frequency'] =
        (typeof frequencyRaw === 'string' &&
          ['QD', 'BID', 'TID', 'QID', 'HS', 'PRN'].includes(frequencyRaw)) ||
        (typeof frequencyRaw === 'string' &&
          ['QD', 'BID', 'TID', 'QID', 'HS', 'PRN'].includes(frequencyRaw.toUpperCase()))
          ? ((typeof frequencyRaw === 'string'
              ? frequencyRaw.toUpperCase()
              : frequencyRaw) as RxLineType['frequency'])
          : 'QD';

      const duration = getNumberLike(lUnknown, 'duration') ?? 0;

      const timingRaw = getValue(lUnknown, 'timing');
      const timing: RxLineType['timing'] | undefined =
        typeof timingRaw === 'string' && ['BEFORE_MEAL', 'AFTER_MEAL', 'ANY'].includes(timingRaw)
          ? (timingRaw as RxLineType['timing'])
          : undefined;

      const notes = (getString(lUnknown, 'notes') ?? '').toString().trim();

      const out: RxLineType = {
        medicine,
        dose,
        frequency,
        duration,
        ...(timing ? { timing } : {}),
        ...(notes ? { notes } : {}),
      };

      return out;
    })
    .filter((x): x is RxLineType => Boolean(x));
}

export function RxPresetImportDialog({
  open,
  onOpenChange,
  disabled,
  append = true,
  existingCount,
  onImport,
}: Props) {
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  const [filter, setFilter] = React.useState<RxPresetFilter>('ALL');

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const presetsQuery = useGetRxPresetsQuery(
    { query: debouncedQuery || undefined, limit: 20, filter },
    { skip: !open },
  );

  const items = (presetsQuery.data?.items ?? []) as PrescriptionPreset[];

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
      setSelectedId(null);
      setFilter('ALL');
    }
  }, [open]);

  const selectedPreset = React.useMemo(
    () => (selectedId ? (items.find((x) => x.id === selectedId) ?? null) : null),
    [items, selectedId],
  );

  const canImport = !disabled && !!selectedPreset?.lines?.length;

  const doImport = () => {
    if (!selectedPreset) return;
    const normalized = normalizePresetLines((selectedPreset.lines ?? []) as unknown[]);
    if (!normalized.length) return;
    onImport(normalized);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[1600px] rounded-3xl p-0 overflow-hidden">
        <div className="flex h-[78vh] flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 border-b bg-linear-to-b from-white to-gray-50">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-gray-800" />
                  Import Rx Preset
                </DialogTitle>
                <div className="mt-1 text-xs text-gray-500">
                  Search and select a preset, then import medicines into this prescription.
                </div>
              </div>

              <div className="flex items-center gap-2">
                {typeof existingCount === 'number' ? (
                  <Badge variant="outline" className="rounded-full">
                    Current: {existingCount}
                  </Badge>
                ) : null}
                <Badge
                  variant="outline"
                  className={`rounded-full ${
                    append ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : ''
                  }`}
                >
                  {append ? 'Append' : 'Replace'}
                </Badge>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search preset name…"
                  className="h-11 rounded-2xl pl-9"
                  disabled={disabled}
                />
              </div>

              <div className="w-full sm:w-[220px]">
                <Select value={filter} onValueChange={(v) => setFilter(v as RxPresetFilter)}>
                  <SelectTrigger className="h-11 rounded-2xl">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="MINE">My presets</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="PUBLIC">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-0 lg:flex-row">
            <div className="min-h-0 flex-1 border-b lg:border-b-0 lg:border-r bg-white">
              <div className="px-6 py-3 text-xs font-semibold text-gray-600">
                Presets {items.length ? `(${items.length})` : ''}
              </div>

              <div className="min-h-0 max-h-full overflow-y-auto px-3 pb-3">
                {presetsQuery.isFetching ? (
                  <div className="px-3 py-8 text-sm text-gray-500">Loading presets…</div>
                ) : items.length === 0 ? (
                  <div className="px-3 py-8 text-sm text-gray-500">No presets found.</div>
                ) : (
                  <div className="space-y-2">
                    {items.map((p) => {
                      const isSelected = selectedId === p.id;

                      const scope = getString(p, 'scope');
                      const tags = getStringArray(p, 'tags');

                      const b = scopeBadge(scope);

                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedId(p.id)}
                          className={[
                            'w-full text-left rounded-2xl border px-4 py-3 transition',
                            isSelected
                              ? 'border-gray-900 bg-gray-50 shadow-sm'
                              : 'border-gray-200 hover:bg-gray-50',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-sm font-semibold text-gray-900">
                                  {p.name}
                                </div>
                                <Badge className={`rounded-full ${b.className}`}>{b.label}</Badge>
                              </div>

                              <div className="mt-1 text-xs text-gray-500">
                                {p.lines?.length ?? 0} medicine
                                {(p.lines?.length ?? 0) === 1 ? '' : 's'}
                                {tags?.length ? ` · ${tags.join(', ')}` : ''}
                              </div>
                            </div>

                            {isSelected ? (
                              <div className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-white">
                                <Check className="h-4 w-4" />
                              </div>
                            ) : (
                              <div className="mt-0.5 h-7 w-7 rounded-full border border-gray-200" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="min-h-0 w-full lg:w-[42%] bg-gray-50">
              <div className="px-6 py-3 text-xs font-semibold text-gray-600">Preview</div>

              <div className="min-h-0 overflow-y-auto px-6 pb-6">
                {!selectedPreset ? (
                  <div className="rounded-2xl border bg-white p-4 text-sm text-gray-500">
                    Select a preset to preview its medicines.
                  </div>
                ) : (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-sm font-semibold text-gray-900">{selectedPreset.name}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {(selectedPreset.lines?.length ?? 0).toString()} medicine
                      {(selectedPreset.lines?.length ?? 0) === 1 ? '' : 's'}
                    </div>

                    <div className="mt-4 space-y-2">
                      {(selectedPreset.lines ?? []).map((lUnknown, idx: number) => {
                        const medicine =
                          getString(lUnknown, 'medicine') ??
                          getString(lUnknown, 'medicineName') ??
                          '—';

                        const dose = getString(lUnknown, 'dose');
                        const frequency = getString(lUnknown, 'frequency');
                        const duration = getString(lUnknown, 'duration');
                        const timing = getString(lUnknown, 'timing');
                        const notes = getString(lUnknown, 'notes');

                        return (
                          <div
                            key={idx}
                            className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"
                          >
                            <div className="text-sm font-medium text-gray-900">{medicine}</div>
                            <div className="mt-0.5 text-xs text-gray-600">
                              {[
                                dose ? `Dose: ${dose}` : null,
                                frequency ? `Freq: ${frequency}` : null,
                                duration ? `Days: ${duration}` : null,
                                timing ? `Timing: ${timing}` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </div>
                            {notes ? (
                              <div className="mt-1 text-xs text-gray-500">Notes: {notes}</div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  After import, medicines will appear as normal editable rows. You can edit or print
                  immediately.
                </div>
              </div>
            </div>
          </div>

          <div className="border-t bg-white px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-gray-500">
                {disabled
                  ? 'Editing is disabled for this visit.'
                  : 'Select a preset to enable Import.'}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  className="rounded-2xl bg-black text-white hover:bg-black/90"
                  disabled={!canImport}
                  onClick={doImport}
                >
                  Import
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
