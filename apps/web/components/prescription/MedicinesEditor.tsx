'use client';

import * as React from 'react';
import { useMemo, useRef, useState } from 'react';
import type { RxLineType } from '@dcm/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

import { MedicineCombobox } from './MedicineCombobox';
import { Plus, Trash2, Pencil, Check, ChevronsUpDown } from 'lucide-react';

type Props = {
  lines: RxLineType[];
  onChange: (next: RxLineType[]) => void;
};

type FrequencyValue = NonNullable<RxLineType['frequency']>;
type TimingBackend = NonNullable<RxLineType['timing']>;
type TimingUI = 'BE_MEAL' | 'AF_MEAL' | 'ANY';

const FREQUENCY = [
  'QD',
  'BID',
  'TID',
  'QID',
  'HS',
  'PRN',
] as const satisfies readonly FrequencyValue[];
const TIMING_UI = ['BE_MEAL', 'AF_MEAL', 'ANY'] as const satisfies readonly TimingUI[];

const COMMON_MEDICINE_TYPES = [
  'Antibiotic',
  'Painkiller',
  'Paracetamol',
  'Anti-inflammatory',
  'Antacid',
  'Antihistamine',
  'Decongestant',
  'Cough Suppressant',
  'Expectorant',
  'Bronchodilator',
  'Steroid',
  'Antifungal',
  'Antiviral',
  'Deworming',
  'Antiseptic',
  'Vitamin',
  'Mouthwash',
  'Local Anesthetic',
] as const;

const timingToUi = (t?: TimingBackend): TimingUI | undefined => {
  if (!t) return undefined;
  if (t === 'BEFORE_MEAL') return 'BE_MEAL';
  if (t === 'AFTER_MEAL') return 'AF_MEAL';
  return 'ANY';
};

const timingToBackend = (t?: TimingUI): TimingBackend | undefined => {
  if (!t) return undefined;
  if (t === 'BE_MEAL') return 'BEFORE_MEAL';
  if (t === 'AF_MEAL') return 'AFTER_MEAL';
  return 'ANY';
};

function isFrequency(v: string): v is FrequencyValue {
  return (FREQUENCY as readonly string[]).includes(v);
}
function isTimingUi(v: string): v is TimingUI {
  return (TIMING_UI as readonly string[]).includes(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

// kept ONLY for legacy fallbacks (older data might have numeric defaultDuration/duration)
function getNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * ✅ MedicineType combobox:
 * - Dropdown of common categories
 * - Search by typing
 * - If not found, user can "Use <typed>"
 */
function MedicineTypeCombobox({
  value,
  onChange,
  triggerRef,
  placeholder = 'Type —',
}: {
  value: string;
  onChange: (next: string) => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  const display = value.trim();
  const q = query.trim();
  const qLower = q.toLowerCase();

  const filtered = COMMON_MEDICINE_TYPES.filter((t) => t.toLowerCase().includes(qLower));

  const exactMatch =
    q.length > 0 ? COMMON_MEDICINE_TYPES.some((t) => t.toLowerCase() === qLower) : false;
  const canUseTyped = q.length > 0 && !exactMatch;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setQuery(display);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          className="w-full justify-between rounded-xl cursor-pointer"
        >
          <span className={cn('truncate text-left', display ? 'text-gray-900' : 'text-gray-500')}>
            {display || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search / type medicine type…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>

            <CommandGroup heading="Common types">
              {filtered.map((t) => (
                <CommandItem
                  key={t}
                  value={t}
                  onSelect={() => {
                    onChange(t);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', display === t ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="truncate">{t}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            {canUseTyped ? (
              <CommandGroup heading="Use typed">
                <CommandItem
                  value={`use:${q}`}
                  onSelect={() => {
                    onChange(q);
                    setOpen(false);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Use “{q}”
                </CommandItem>
              </CommandGroup>
            ) : null}

            {display ? (
              <CommandGroup heading="Actions">
                <CommandItem
                  value="clear"
                  onSelect={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  Clear
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function MedicinesEditor({ lines, onChange }: Props) {
  const [medicine, setMedicine] = useState('');
  const [medicineType, setMedicineType] = useState(''); // ✅ stored in RxLine now
  const [dose, setDose] = useState(''); // optional
  const [amountPerDose, setAmountPerDose] = useState(''); // e.g. "1 tab / 5ml"

  const [frequency, setFrequency] = useState<FrequencyValue | undefined>(undefined);
  const [timingUi, setTimingUi] = useState<TimingUI | undefined>(undefined);

  // ✅ quantity is STRING now (e.g., "10 tabs", "5 cups")
  const [quantityStr, setQuantityStr] = useState('');

  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState('');

  const [rowNotesIndex, setRowNotesIndex] = useState<number | null>(null);
  const [rowNotesDraft, setRowNotesDraft] = useState('');

  const medInputRef = useRef<HTMLInputElement | null>(null);
  const medTriggerRef = useRef<HTMLButtonElement | null>(null);
  const typeTriggerRef = useRef<HTMLButtonElement | null>(null);

  const doseRef = useRef<HTMLInputElement | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const freqTriggerRef = useRef<HTMLButtonElement | null>(null);
  const timingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const quantityRef = useRef<HTMLInputElement | null>(null);

  const notesBtnRef = useRef<HTMLButtonElement | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);

  const goNext = (el?: HTMLElement | null) => {
    requestAnimationFrame(() => el?.focus());
  };

  const applyMedicineDefaults = (picked: unknown) => {
    if (!isRecord(picked)) return;

    const dd = getString((picked as any).defaultDose);
    if (dd) setDose(dd);

    const df = getString((picked as any).defaultFrequency);
    if (df && isFrequency(df)) setFrequency(df);

    /**
     * ✅ FIX: Quantity may come as:
     * - defaultQuantity (medicine preset)
     * - quantity (rx preset line / imported line)
     * - qty (some payloads)
     * - legacy defaultDuration (number)
     */
    const qStrTop =
      getString((picked as any).defaultQuantity) ??
      getString((picked as any).quantity) ??
      getString((picked as any).qty);

    if (qStrTop) {
      setQuantityStr(qStrTop);
    } else {
      const legacy = getNumber((picked as any).defaultDuration);
      if (typeof legacy === 'number' && legacy > 0) setQuantityStr(String(Math.trunc(legacy)));
    }

    const mt = getString((picked as any).medicineType);
    if (mt) setMedicineType(mt);

    const apd = getString((picked as any).defaultAmountPerDose);
    if (apd) setAmountPerDose(apd);

    // legacy nested defaults (fallback)
    const defaultsRaw =
      (picked as any).defaults ?? (picked as any).default ?? (picked as any).presetDefaults;
    if (!isRecord(defaultsRaw)) return;

    const d =
      (defaultsRaw as any).dose ??
      (defaultsRaw as any).doseText ??
      (defaultsRaw as any).dosage ??
      (defaultsRaw as any).strength ??
      (defaultsRaw as any).defaultDose;
    const dStr = getString(d);
    if (dStr) setDose(dStr);

    const f =
      (defaultsRaw as any).frequency ??
      (defaultsRaw as any).freq ??
      (defaultsRaw as any).defaultFrequency;
    const fStr = getString(f);
    if (fStr && isFrequency(fStr)) setFrequency(fStr);

    /**
     * ✅ FIX: nested quantity might also be stored as `quantity`
     * not only `defaultQuantity`
     */
    const nestedQtyStr =
      getString((defaultsRaw as any).quantity) ??
      getString((defaultsRaw as any).qty) ??
      getString((defaultsRaw as any).defaultQuantity);

    if (nestedQtyStr) {
      setQuantityStr(nestedQtyStr);
    } else {
      // legacy duration fields (old data)
      const legacyDur =
        (defaultsRaw as any).duration ??
        (defaultsRaw as any).dur ??
        (defaultsRaw as any).days ??
        (defaultsRaw as any).durationDays ??
        (defaultsRaw as any).defaultDuration;

      const legacyDurNum = getNumber(legacyDur);
      if (typeof legacyDurNum === 'number' && legacyDurNum > 0) {
        setQuantityStr(String(Math.trunc(legacyDurNum)));
      }
    }

    const t =
      (defaultsRaw as any).timing ??
      (defaultsRaw as any).time ??
      (defaultsRaw as any).defaultTiming;
    const tStr = getString(t);
    if (tStr) {
      if (tStr === 'BEFORE_MEAL') setTimingUi('BE_MEAL');
      else if (tStr === 'AFTER_MEAL') setTimingUi('AF_MEAL');
      else if (tStr === 'ANY') setTimingUi('ANY');
    }

    const n = (defaultsRaw as any).notes ?? (defaultsRaw as any).note;
    const nStr = getString(n);
    if (nStr) {
      setNotes(nStr);
      setNotesOpen(true);
    }
  };

  // ✅ only medicine required
  const canAdd = useMemo(() => medicine.trim().length > 0, [medicine]);

  const add = () => {
    const med = medicine.trim();
    if (!med) return;

    const mt = medicineType.trim();
    const d = dose.trim();
    const apd = amountPerDose.trim();

    const freq = frequency;
    const timing = timingToBackend(timingUi);

    // ✅ store quantity as STRING, no numeric conversion
    const q = quantityStr.trim();
    const n = notes.trim();

    const next: RxLineType = {
      medicine: med,
      ...(mt ? { medicineType: mt } : {}),
      ...(d ? { dose: d } : {}),
      ...(apd ? { amountPerDose: apd } : {}),
      ...(freq ? { frequency: freq } : {}),
      ...(q ? { quantity: q } : {}),
      ...(timing ? { timing } : {}),
      ...(n ? { notes: n } : {}),
    };

    onChange([...lines, next]);

    setMedicine('');
    setMedicineType('');
    setDose('');
    setAmountPerDose('');
    setFrequency(undefined);
    setTimingUi(undefined);
    setQuantityStr('');
    setNotes('');
    setNotesOpen(false);

    requestAnimationFrame(() => medTriggerRef.current?.focus());
  };

  const remove = (idx: number) => {
    const next = lines.slice();
    next.splice(idx, 1);
    onChange(next);
    if (rowNotesIndex === idx) {
      setRowNotesIndex(null);
      setRowNotesDraft('');
    }
  };

  const edit = (idx: number) => {
    const row = lines[idx] as any;

    setMedicine(row?.medicine ?? '');
    setMedicineType(row?.medicineType ?? '');
    setDose(row?.dose ?? '');
    setAmountPerDose(row?.amountPerDose ?? '');

    setFrequency(row?.frequency ?? undefined);

    // ✅ quantity string (fallback: legacy duration number)
    const q =
      getString(row?.quantity) ?? (typeof row?.duration === 'number' ? String(row.duration) : '');
    setQuantityStr(q ?? '');

    setTimingUi(timingToUi(row?.timing ?? undefined));
    setNotes(row?.notes ?? '');
    setNotesOpen(Boolean(row?.notes?.trim()));

    remove(idx);
    requestAnimationFrame(() => medTriggerRef.current?.focus());
  };

  const saveRowNotes = () => {
    if (rowNotesIndex == null) return;

    const next = lines.slice() as any[];
    const trimmed = rowNotesDraft.trim();

    next[rowNotesIndex] = {
      ...next[rowNotesIndex],
      ...(trimmed ? { notes: trimmed } : { notes: undefined }),
    };

    onChange(next as RxLineType[]);
    setRowNotesIndex(null);
    setRowNotesDraft('');
  };

  const openNotesPopover = () => {
    setNotesOpen(true);
    requestAnimationFrame(() => notesTextareaRef.current?.focus());
  };

  const closeNotesPopoverToAdd = () => {
    setNotesOpen(false);
    requestAnimationFrame(() => addBtnRef.current?.focus());
  };

  const shouldScroll = lines.length > 4;

  const timingLabel = (t?: TimingBackend) => timingToUi(t) ?? '—';
  const freqLabel = (f?: RxLineType['frequency']) => f ?? '—';
  const qtyLabel = (q?: unknown) => {
    const s = getString(q);
    if (s) return s;
    if (typeof q === 'number' && Number.isFinite(q)) return String(q); // legacy
    return '—';
  };
  const typeLabel = (t?: string) => (t && t.trim() ? t.trim() : '—');
  const amountLabel = (a?: string) => (a && a.trim() ? a.trim() : '—');

  return (
    <div className="w-full overflow-hidden rounded-xl border bg-white">
      <div className="border-b bg-white px-3 py-3">
        {/* ROW 1 */}
        <div className="flex items-center gap-2">
          <div className="w-[25%]">
            <MedicineCombobox
              value={medicine}
              placeholder="Medicine name"
              inputRef={medInputRef}
              triggerRef={medTriggerRef}
              onPick={(m: any) => {
                setMedicine(m.displayName);

                if (typeof m.medicineType === 'string' && m.medicineType.trim()) {
                  setMedicineType(m.medicineType.trim());
                }

                applyMedicineDefaults(m);
                goNext(typeTriggerRef.current);
              }}
              onEnterPicked={() => goNext(typeTriggerRef.current)}
            />
          </div>

          <div className="w-[30%]">
            <Input
              ref={doseRef}
              className="h-9 rounded-xl"
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="Dose (optional)"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                goNext(amountRef.current);
              }}
            />
          </div>

          <div className="w-[20%]">
            <MedicineTypeCombobox
              value={medicineType}
              onChange={(next) => {
                setMedicineType(next);
                goNext(quantityRef.current);
              }}
              triggerRef={typeTriggerRef}
              placeholder="Type —"
            />
          </div>

          <div className="w-[20%]">
            <Input
              ref={amountRef}
              className="h-9 rounded-xl"
              value={amountPerDose}
              onChange={(e) => setAmountPerDose(e.target.value)}
              placeholder="Qty/Time"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                goNext(freqTriggerRef.current);
              }}
            />
          </div>

          <div className="w-[16.666%]">
            <Select
              value={frequency ?? ''}
              onValueChange={(v) => {
                setFrequency(isFrequency(v) ? v : undefined);
                goNext(timingTriggerRef.current);
              }}
            >
              <SelectTrigger
                ref={freqTriggerRef}
                className="h-10 rounded-xl w-full cursor-pointer"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  goNext(timingTriggerRef.current);
                }}
              >
                <SelectValue placeholder="Freq" />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY.map((f) => (
                  <SelectItem key={f} value={f} className="cursor-pointer">
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ROW 2 */}
        <div className="mt-2 flex items-center gap-2">
          <div className="w-[45.666%]">
            <Input
              ref={quantityRef}
              className="h-9 rounded-xl"
              value={quantityStr}
              onChange={(e) => setQuantityStr(e.target.value)}
              placeholder='Qty (e.g., "5 Tabs")'
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                goNext(notesBtnRef.current);
              }}
            />
          </div>

          <div className="w-[16.666%]">
            <Select
              value={timingUi ?? ''}
              onValueChange={(v) => {
                setTimingUi(isTimingUi(v) ? v : undefined);
              }}
            >
              <SelectTrigger
                ref={timingTriggerRef}
                className="h-10 rounded-xl cursor-pointer"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                }}
              >
                <SelectValue placeholder="Timing" />
              </SelectTrigger>
              <SelectContent>
                {TIMING_UI.map((t) => (
                  <SelectItem key={t} value={t} className="cursor-pointer">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[16.666%]">
            <Popover
              open={notesOpen}
              onOpenChange={(open) => {
                setNotesOpen(open);
                if (open) requestAnimationFrame(() => notesTextareaRef.current?.focus());
              }}
            >
              <PopoverTrigger asChild>
                <div className="flex items-center justify-start">
                  <Button
                    ref={notesBtnRef}
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-12 rounded-xl cursor-pointer"
                    aria-label="Add notes"
                    onClick={() => openNotesPopover()}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      openNotesPopover();
                    }}
                  >
                    Add
                  </Button>
                </div>
              </PopoverTrigger>

              <PopoverContent side="bottom" align="end" className="w-80 rounded-2xl p-3">
                <div className="mb-2 text-sm font-semibold text-gray-900">Notes</div>
                <Textarea
                  ref={notesTextareaRef}
                  className="min-h-22.5 resize-none rounded-xl"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes for this medicine…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      closeNotesPopoverToAdd();
                    }
                  }}
                />
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-[11px] text-gray-500">
                    {notes.trim() ? 'Will be saved with this line.' : 'Optional'}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 rounded-xl px-3 text-xs cursor-pointer"
                    onClick={() => closeNotesPopoverToAdd()}
                  >
                    Done
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="w-full">
            <div className="flex justify-end">
              <Button
                ref={addBtnRef}
                type="button"
                className="h-10 w-34 rounded-xl cursor-pointer"
                disabled={!canAdd}
                onClick={add}
                aria-label="Add medicine"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  add();
                }}
              >
                <Plus className="h-5 w-5" />
                <div>Add Medicine</div>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* HEADER */}
      <div className="flex items-center gap-2 border-b bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-600">
        <div className="w-[22%]">Medicine</div>
        <div className="w-[14%]">Type</div>
        <div className="w-[12%]">Qty/Time</div>
        <div className="w-[14%]">Frequency</div>
        <div className="w-[12%]">Quantity</div>
        <div className="w-[12%] pl-2">Timing</div>
        <div className="w-[14%] pl-5">Notes</div>
        <div className="w-[8%]">Actions</div>
      </div>

      {/* LIST */}
      <div
        className={[
          'divide-y',
          shouldScroll ? 'max-h-50 2xl:max-h-full overflow-y-auto' : '',
          'dms-scroll',
        ].join(' ')}
      >
        {lines.length === 0 ? (
          <div className="px-3 py-6 text-sm text-gray-500">No medicines added yet.</div>
        ) : (
          lines.map((l: any, idx) => {
            // ✅ quantity string (fallback: legacy duration number)
            const q =
              getString(l.quantity) ??
              (typeof l.duration === 'number' ? String(l.duration) : undefined);

            return (
              <div key={idx} className="flex items-start gap-2 px-3 py-1 text-sm">
                <div className="w-[22%]">
                  <div className="font-medium text-gray-900">{l.medicine}</div>
                  {l.dose ? <div className="text-[12px] text-gray-500">{l.dose}</div> : null}
                </div>

                <div className="w-[14%] text-gray-800">{typeLabel(l.medicineType)}</div>

                <div className="w-[12%] text-gray-800">{amountLabel(l.amountPerDose)}</div>

                <div className="w-[14%] pl-1 text-gray-800">{freqLabel(l.frequency)}</div>

                <div className="w-[12%] pl-1 text-gray-800">{qtyLabel(q)}</div>

                <div className="w-[12%] pl-2 text-gray-800">{timingLabel(l.timing)}</div>

                <div className="w-[14%]">
                  <Popover
                    open={rowNotesIndex === idx}
                    onOpenChange={(open) => {
                      if (open) {
                        setRowNotesIndex(idx);
                        setRowNotesDraft(lines[idx]?.notes ?? '');
                      } else {
                        setRowNotesIndex(null);
                        setRowNotesDraft('');
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 pl-6 text-xs font-semibold text-gray-800 underline decoration-gray-200 underline-offset-2 hover:decoration-gray-400"
                      >
                        {l.notes?.trim() ? 'View' : 'Add'}
                      </Button>
                    </PopoverTrigger>

                    <PopoverContent side="bottom" align="start" className="w-80 rounded-2xl p-3">
                      <div className="mb-2 text-sm font-semibold text-gray-900">Notes</div>
                      <Textarea
                        className="min-h-22.5 resize-none rounded-xl"
                        value={rowNotesIndex === idx ? rowNotesDraft : ''}
                        onChange={(e) => setRowNotesDraft(e.target.value)}
                        placeholder="Add or edit notes…"
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 rounded-xl px-3 text-xs"
                          onClick={() => {
                            setRowNotesIndex(null);
                            setRowNotesDraft('');
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          className="h-8 rounded-xl px-3 text-xs"
                          onClick={saveRowNotes}
                        >
                          Save
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="w-[8%]">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-xl"
                      onClick={() => edit(idx)}
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-xl text-gray-600 hover:text-gray-900"
                      onClick={() => remove(idx)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
