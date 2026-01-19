'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

import { ArrowLeft, Loader2, Pencil, Plus, Trash2, Save } from 'lucide-react';

import type { RxLineType, MedicineTypeaheadItem } from '@dcm/types';

import { MedicineCombobox } from '@/components/prescription/MedicineCombobox';

const FREQUENCIES = ['QD', 'BID', 'TID', 'QID', 'HS', 'PRN'] as const;
type Frequency = (typeof FREQUENCIES)[number];

const TIMINGS = ['BEFORE_MEAL', 'AFTER_MEAL', 'ANY'] as const;
type Timing = (typeof TIMINGS)[number];

function isFrequency(v: unknown): v is Frequency {
  return typeof v === 'string' && (FREQUENCIES as readonly string[]).includes(v);
}

function isTiming(v: unknown): v is Timing {
  return typeof v === 'string' && (TIMINGS as readonly string[]).includes(v);
}

const timingLabel = (t?: Timing) => {
  if (!t) return '—';
  if (t === 'BEFORE_MEAL') return 'Before meal';
  if (t === 'AFTER_MEAL') return 'After meal';
  return 'Any time';
};

const tagsToArray = (csv: string) =>
  csv
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

type RxLineLike = Partial<
  Pick<RxLineType, 'medicine' | 'frequency' | 'duration' | 'timing' | 'sig' | 'notes'>
> & {
  dose?: unknown;
};

type MedicineDefaultsLike = {
  defaultFrequency?: unknown;
  defaultDuration?: unknown;
  defaultDose?: unknown;
};

function readDefaults(item: MedicineTypeaheadItem): MedicineDefaultsLike {
  return (item as unknown as MedicineDefaultsLike) ?? {};
}

function oneLineSummary(l: RxLineType) {
  const parts: string[] = [];
  parts.push(l.medicine);
  parts.push(String((l as unknown as RxLineLike).dose ?? ''));
  parts.push(l.frequency);
  parts.push(`${l.duration}d`);
  if (l.timing) parts.push(timingLabel(isTiming(l.timing) ? l.timing : undefined));
  return parts.filter(Boolean).join(' · ');
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export type RxPresetEditorInitial = {
  name?: string;
  tags?: string[];
  lines?: RxLineType[];
};

export type RxPresetEditorSubmitPayload = {
  name: string;
  tags?: string[];
  lines: RxLineType[];
};

export type RxPresetEditorProps = {
  mode: 'create' | 'edit';
  backHref: string;

  initial?: RxPresetEditorInitial;

  loading?: boolean;
  error?: boolean;

  canUseApi: boolean;

  onSubmit: (payload: RxPresetEditorSubmitPayload) => Promise<void>;

  submitLabel?: string;
  submitting?: boolean;
};

export default function RxPresetEditor({
  mode,
  backHref,
  initial,
  loading,
  error,
  canUseApi,
  onSubmit,
  submitLabel,
  submitting,
}: RxPresetEditorProps) {
  const [presetName, setPresetName] = useState('');
  const [tagsCsv, setTagsCsv] = useState('');

  const [lines, setLines] = useState<RxLineType[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const [medicine, setMedicine] = useState('');
  const [dose, setDose] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('BID');
  const [duration, setDuration] = useState<string>('5');
  const [timing, setTiming] = useState<Timing>('ANY');
  const [sig, setSig] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!initial) return;

    setPresetName(initial.name ?? '');
    setTagsCsv((initial.tags ?? []).join(', '));
    setLines((initial.lines ?? []) as RxLineType[]);

    setEditingIndex(null);
    setMedicine('');
    setDose('');
    setFrequency('BID');
    setDuration('5');
    setTiming('ANY');
    setSig('');
    setNotes('');
  }, [initial?.name, (initial?.tags ?? []).join('|'), (initial?.lines ?? []).length]);

  const durationNum = useMemo(() => {
    const n = Number(duration);
    return Number.isFinite(n) ? n : NaN;
  }, [duration]);

  const lineValid =
    medicine.trim().length > 0 &&
    dose.trim().length > 0 &&
    FREQUENCIES.includes(frequency) &&
    Number.isFinite(durationNum) &&
    durationNum >= 1 &&
    durationNum <= 365;

  const presetValid = canUseApi && presetName.trim().length > 0 && lines.length > 0;

  const tagsArr = useMemo(() => tagsToArray(tagsCsv), [tagsCsv]);

  const medicinesOneLine = useMemo(() => {
    const meds = lines.map((l) => l.medicine).filter(Boolean);
    if (meds.length === 0) return null;
    const shown = meds.slice(0, 6);
    const remaining = meds.length - shown.length;
    return remaining > 0 ? `${shown.join(', ')} +${remaining} more` : shown.join(', ');
  }, [lines]);

  const clearLineForm = () => {
    setMedicine('');
    setDose('');
    setFrequency('BID');
    setDuration('5');
    setTiming('ANY');
    setSig('');
    setNotes('');
    setEditingIndex(null);
  };

  const applyMedicineDefaults = (item: MedicineTypeaheadItem) => {
    setMedicine(item.displayName ?? '');

    const defs = readDefaults(item);

    const df = defs.defaultFrequency;
    if (isFrequency(df)) setFrequency(df);

    const dd = defs.defaultDuration;
    if (typeof dd === 'number' && Number.isFinite(dd) && dd >= 1 && dd <= 365) {
      setDuration(String(dd));
    }

    const dDose = defs.defaultDose;
    if (typeof dDose === 'string' && dDose.trim()) {
      setDose(dDose.trim());
    }
  };

  const onAddOrUpdateLine = () => {
    if (!lineValid) return;

    const newLine: RxLineType = {
      medicine: medicine.trim(),
      dose: dose.trim(),
      frequency,
      duration: durationNum,
      timing: timing || undefined,
      sig: sig.trim() ? sig.trim() : undefined,
      notes: notes.trim() ? notes.trim() : undefined,
    } as RxLineType;

    setLines((prev) => {
      if (editingIndex === null) return [...prev, newLine];
      return prev.map((l, i) => (i === editingIndex ? newLine : l));
    });

    clearLineForm();
  };

  const onEditLine = (idx: number) => {
    const l = lines[idx] as unknown as RxLineLike;

    setMedicine((l.medicine as string) ?? '');
    setDose(typeof l.dose === 'string' ? l.dose : '');
    setFrequency(isFrequency(l.frequency) ? l.frequency : 'BID');
    setDuration(String(typeof l.duration === 'number' ? l.duration : 5));
    setTiming(isTiming(l.timing) ? l.timing : 'ANY');
    setSig(typeof l.sig === 'string' ? l.sig : '');
    setNotes(typeof l.notes === 'string' ? l.notes : '');
    setEditingIndex(idx);
  };

  const onDeleteLine = (idx: number) => {
    setLines((prev) => prev.filter((_l, i) => i !== idx));
    if (editingIndex === idx) clearLineForm();
  };

  const handleSubmit = async () => {
    if (!presetValid) return;
    const tags = tagsToArray(tagsCsv);

    await onSubmit({
      name: presetName.trim(),
      tags: tags.length ? tags : undefined,
      lines,
    });
  };

  const submitText = submitLabel ?? (mode === 'create' ? 'Create Preset' : 'Save Changes');

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="mx-auto w-full max-w-none px-4 py-4 2xl:px-10 2xl:py-10">
        <div className="sticky top-0 z-10 -mx-4 mb-4 border-b bg-gray-50/80 px-4 py-3 backdrop-blur 2xl:-mx-10 2xl:px-10">
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="secondary" className="h-10 rounded-2xl">
              <Link href={backHref}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>

            <div className="flex items-center gap-2">
              <div className="hidden text-right text-[11px] text-gray-500 md:block">
                Lines: <span className="font-medium text-gray-900">{lines.length}</span>
              </div>

              <Button
                className="h-10 rounded-2xl"
                onClick={handleSubmit}
                disabled={!presetValid || !!submitting}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : mode === 'edit' ? (
                  <Save className="mr-2 h-4 w-4" />
                ) : null}
                {submitText}
              </Button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="rounded-2xl border bg-white px-6 py-5 text-sm text-gray-600">
            Loading preset…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
            Failed to load preset. Check API logs / network tab.
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
            <div className="min-w-0 flex-1">
              <Card className="rounded-3xl border bg-white p-0 shadow-sm">
                <div className="border-b px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-xl font-semibold text-gray-900">
                        {presetName.trim() ? presetName.trim() : 'Untitled preset'}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {tagsArr.length ? (
                          tagsArr.map((t) => (
                            <Badge
                              key={t}
                              variant="secondary"
                              className="rounded-full px-3 py-1 text-[11px]"
                            >
                              {t}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                            No tags
                          </Badge>
                        )}
                      </div>

                      <div className="mt-3 text-[12px] text-gray-600">
                        {medicinesOneLine ? (
                          <span className="line-clamp-1">{medicinesOneLine}</span>
                        ) : (
                          <span className="text-gray-500">No medicines added yet.</span>
                        )}
                      </div>
                    </div>

                    <div className="hidden shrink-0 rounded-2xl bg-gray-50 px-3 py-2 text-right text-[11px] text-gray-600 md:block">
                      <div className="font-medium text-gray-900">{lines.length}</div>
                      <div>lines</div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {lines.length === 0 ? (
                    <div className="rounded-3xl border border-dashed bg-gray-50 p-10 text-center">
                      <div className="mx-auto max-w-md">
                        <div className="text-sm font-semibold text-gray-900">
                          Start by adding a medicine line
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                          Use the builder on the right. Each line will appear here with full
                          details.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {lines.map((l, idx) => (
                        <div
                          key={idx}
                          className={cx(
                            'rounded-3xl border bg-white p-4 transition',
                            editingIndex === idx && 'ring-2 ring-ring/30',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-base font-semibold text-gray-900">
                                {l.medicine}
                              </div>
                              <div className="mt-1 text-[12px] text-gray-600">
                                {oneLineSummary(l)}
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] text-gray-700">
                                <div>
                                  <span className="text-gray-500">Dose:</span>{' '}
                                  <span className="font-medium">
                                    {String((l as unknown as RxLineLike).dose ?? '')}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Frequency:</span>{' '}
                                  <span className="font-medium">{l.frequency}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Duration:</span>{' '}
                                  <span className="font-medium">{l.duration} days</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Timing:</span>{' '}
                                  <span className="font-medium">
                                    {timingLabel(isTiming(l.timing) ? l.timing : undefined)}
                                  </span>
                                </div>
                              </div>

                              {(l.sig || l.notes) && (
                                <div className="mt-3 rounded-2xl bg-gray-50 p-3 text-[12px] text-gray-700">
                                  {l.sig ? (
                                    <div>
                                      <span className="text-gray-500">SIG:</span>{' '}
                                      <span className="font-medium">{l.sig}</span>
                                    </div>
                                  ) : null}
                                  {l.notes ? (
                                    <div className={l.sig ? 'mt-2' : ''}>
                                      <span className="text-gray-500">Notes:</span> {l.notes}
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                variant="secondary"
                                className="h-9 rounded-2xl"
                                onClick={() => onEditLine(idx)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </Button>
                              <Button
                                variant="destructive"
                                className="h-9 rounded-2xl"
                                onClick={() => onDeleteLine(idx)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!canUseApi && (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      Please log in as admin to {mode === 'create' ? 'create' : 'edit'} presets.
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <div className="w-full xl:w-120 xl:sticky xl:top-20">
              <Card className="rounded-3xl border bg-white p-0 shadow-sm">
                <div className="border-b px-6 py-5">
                  <div className="text-sm font-semibold text-gray-900">Preset Builder</div>
                  <div className="mt-1 text-[12px] text-gray-600">
                    Add / edit a medicine line → updates immediately on the left.
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                      <Label className="text-xs">Preset name</Label>
                      <Input
                        className="h-10 rounded-2xl"
                        placeholder="e.g., Teeth transplant protocol"
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label className="text-xs">Tags (comma-separated)</Label>
                      <Input
                        className="h-10 rounded-2xl"
                        placeholder="e.g., surgery, antibiotics"
                        value={tagsCsv}
                        onChange={(e) => setTagsCsv(e.target.value)}
                      />
                    </div>

                    <div className="h-px bg-gray-100" />

                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">
                        {editingIndex === null
                          ? 'Add medicine line'
                          : `Edit line #${editingIndex + 1}`}
                      </div>
                      {editingIndex !== null && (
                        <Button
                          variant="secondary"
                          className="h-8 rounded-xl px-3 text-xs"
                          onClick={clearLineForm}
                        >
                          Cancel edit
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label className="text-xs">Medicine (required)</Label>
                      <MedicineCombobox
                        value={medicine}
                        placeholder="Search medicine…"
                        onPick={(item) => {
                          applyMedicineDefaults(item);
                        }}
                      />
                      {medicine.trim().length === 0 ? (
                        <div className="text-[11px] text-gray-500">
                          Type at least 2 characters to search.
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row">
                      <div className="flex-1">
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs">Dose (required)</Label>
                          <Input
                            className="h-10 rounded-2xl"
                            placeholder="e.g., 500mg"
                            value={dose}
                            onChange={(e) => setDose(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flex-1">
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs">Duration (days)</Label>
                          <Input
                            className="h-10 rounded-2xl"
                            inputMode="numeric"
                            placeholder="e.g., 5"
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                          />
                          {!Number.isFinite(durationNum) || durationNum < 1 || durationNum > 365 ? (
                            <div className="text-[11px] text-gray-500">Duration must be 1–365.</div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row">
                      <div className="flex-1">
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs">Frequency</Label>
                          <select
                            className="h-10 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring/50"
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value as Frequency)}
                          >
                            {FREQUENCIES.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex-1">
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs">Timing</Label>
                          <select
                            className="h-10 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring/50"
                            value={timing}
                            onChange={(e) => setTiming(e.target.value as Timing)}
                          >
                            {TIMINGS.map((t) => (
                              <option key={t} value={t}>
                                {timingLabel(t as Timing)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label className="text-xs">SIG (optional)</Label>
                      <Input
                        className="h-10 rounded-2xl"
                        placeholder="e.g., Take after meals"
                        value={sig}
                        onChange={(e) => setSig(e.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label className="text-xs">Notes (optional)</Label>
                      <Textarea
                        className="rounded-2xl"
                        rows={4}
                        placeholder="Any notes to store with this preset…"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>

                    <Button
                      className="h-10 rounded-2xl"
                      disabled={!lineValid}
                      onClick={onAddOrUpdateLine}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {editingIndex === null ? 'Add line' : 'Update line'}
                    </Button>

                    <div className="text-[11px] text-gray-500">
                      Required: medicine, dose, frequency, duration. Timing optional.
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        <div className="h-10" />
      </div>
    </div>
  );
}
