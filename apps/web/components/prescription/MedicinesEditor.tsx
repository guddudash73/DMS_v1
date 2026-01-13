'use client';

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
import { MedicineCombobox } from './MedicineCombobox';
import { Plus, Trash2, Pencil } from 'lucide-react';

type Props = {
  lines: RxLineType[];
  onChange: (next: RxLineType[]) => void;
};

type Frequency = RxLineType['frequency'];
type TimingBackend = NonNullable<RxLineType['timing']>;
type TimingUI = 'BE_MEAL' | 'AF_MEAL' | 'ANY';

const FREQUENCY = ['QD', 'BID', 'TID', 'QID', 'HS', 'PRN'] as const satisfies readonly Frequency[];

const TIMING_UI = ['BE_MEAL', 'AF_MEAL', 'ANY'] as const satisfies readonly TimingUI[];

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

function isFrequency(v: string): v is Frequency {
  return (FREQUENCY as readonly string[]).includes(v);
}
function isTimingUi(v: string): v is TimingUI {
  return (TIMING_UI as readonly string[]).includes(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function MedicinesEditor({ lines, onChange }: Props) {
  const [medicine, setMedicine] = useState('');
  const [dose, setDose] = useState('');
  const [frequency, setFrequency] = useState<Frequency | undefined>(undefined);
  const [durationDays, setDurationDays] = useState('');
  const [timingUi, setTimingUi] = useState<TimingUI | undefined>(undefined);

  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState('');

  const [rowNotesIndex, setRowNotesIndex] = useState<number | null>(null);
  const [rowNotesDraft, setRowNotesDraft] = useState('');

  const medInputRef = useRef<HTMLInputElement | null>(null);
  const medTriggerRef = useRef<HTMLButtonElement | null>(null);
  const doseRef = useRef<HTMLInputElement | null>(null);
  const freqTriggerRef = useRef<HTMLButtonElement | null>(null);
  const durationRef = useRef<HTMLInputElement | null>(null);
  const timingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const notesBtnRef = useRef<HTMLButtonElement | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);

  const goNext = (el?: HTMLElement | null) => {
    requestAnimationFrame(() => el?.focus());
  };

  const applyMedicineDefaults = (picked: unknown) => {
    if (!isRecord(picked)) return;

    const defaultsRaw = picked.defaults ?? picked.default ?? picked.presetDefaults;
    if (!isRecord(defaultsRaw)) return;

    const d =
      defaultsRaw.dose ??
      defaultsRaw.doseText ??
      defaultsRaw.dosage ??
      defaultsRaw.strength ??
      defaultsRaw.defaultDose;

    if (typeof d === 'string' && d.trim()) setDose(d.trim());

    const f = defaultsRaw.frequency ?? defaultsRaw.freq ?? defaultsRaw.defaultFrequency;
    if (typeof f === 'string' && isFrequency(f)) setFrequency(f);

    const dur =
      defaultsRaw.duration ??
      defaultsRaw.dur ??
      defaultsRaw.days ??
      defaultsRaw.durationDays ??
      defaultsRaw.defaultDuration;

    if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) setDurationDays(String(dur));
    if (typeof dur === 'string' && dur.trim() && Number.isFinite(Number(dur))) {
      const n = Number(dur);
      if (n > 0) setDurationDays(String(n));
    }

    const t = defaultsRaw.timing ?? defaultsRaw.time ?? defaultsRaw.defaultTiming;
    if (typeof t === 'string') {
      if (t === 'BEFORE_MEAL') setTimingUi('BE_MEAL');
      else if (t === 'AFTER_MEAL') setTimingUi('AF_MEAL');
      else if (t === 'ANY') setTimingUi('ANY');
    }

    const n = defaultsRaw.notes ?? defaultsRaw.note;
    if (typeof n === 'string' && n.trim()) {
      setNotes(n.trim());
      setNotesOpen(true);
    }
  };

  const canAdd = useMemo(() => {
    if (!medicine.trim()) return false;
    if (!dose.trim()) return false;
    if (!frequency) return false;
    const d = Number(durationDays);
    if (!Number.isFinite(d) || d < 1) return false;
    return true;
  }, [medicine, dose, frequency, durationDays]);

  const add = () => {
    const med = medicine.trim();
    const d = dose.trim();
    const freq = frequency;
    const durNum = Number(durationDays);

    if (!med) return;
    if (!d) return;
    if (!freq) return;
    if (!Number.isFinite(durNum) || durNum < 1) return;

    const timing = timingToBackend(timingUi);

    const next: RxLineType = {
      medicine: med,
      dose: d,
      frequency: freq,
      duration: durNum,
      ...(timing ? { timing } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    onChange([...lines, next]);

    setMedicine('');
    setDose('');
    setFrequency(undefined);
    setDurationDays('');
    setTimingUi(undefined);

    setNotes('');
    setNotesOpen(false);

    requestAnimationFrame(() => {
      medTriggerRef.current?.focus();
    });
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
    const row = lines[idx];
    setMedicine(row.medicine ?? '');
    setDose(row.dose ?? '');
    setFrequency(row.frequency);
    setDurationDays(String(row.duration ?? ''));
    setTimingUi(timingToUi(row.timing ?? undefined));
    setNotes(row.notes ?? '');
    setNotesOpen(Boolean(row.notes?.trim()));
    remove(idx);

    requestAnimationFrame(() => {
      medTriggerRef.current?.focus();
    });
  };

  const saveRowNotes = () => {
    if (rowNotesIndex == null) return;

    const next = lines.slice();
    const trimmed = rowNotesDraft.trim();

    next[rowNotesIndex] = {
      ...next[rowNotesIndex],
      ...(trimmed ? { notes: trimmed } : { notes: undefined }),
    };

    onChange(next);
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

  const timingLabel = (t?: TimingBackend) => {
    const ui = timingToUi(t);
    return ui ?? '—';
  };

  return (
    <div className=" w-full overflow-hidden rounded-xl border bg-white">
      <div className="border-b bg-white px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="w-[25%]">
            <MedicineCombobox
              value={medicine}
              onPick={(m) => {
                setMedicine(m.displayName);

                applyMedicineDefaults(m);

                if (m.defaultFrequency && isFrequency(m.defaultFrequency)) {
                  setFrequency(m.defaultFrequency);
                }

                if (typeof m.defaultDuration === 'number') {
                  setDurationDays(String(m.defaultDuration));
                }

                goNext(doseRef.current);
              }}
              placeholder="Medicine name"
              inputRef={medInputRef}
              triggerRef={medTriggerRef}
              onEnterPicked={() => goNext(doseRef.current)}
            />
          </div>

          <div className="w-[16.666%]">
            <Select
              value={frequency ?? ''}
              onValueChange={(v) => {
                setFrequency(isFrequency(v) ? v : undefined);
                goNext(durationRef.current);
              }}
            >
              <SelectTrigger
                ref={freqTriggerRef}
                className="h-10 rounded-xl w-full cursor-pointer"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  if (frequency) {
                    e.preventDefault();
                    goNext(durationRef.current);
                  }
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

          <div className="w-[16.666%]">
            <Input
              ref={durationRef}
              className="h-9 rounded-xl"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              placeholder="Days"
              inputMode="numeric"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                goNext(timingTriggerRef.current);
              }}
            />
          </div>

          <div className="w-[16.666%] pl-1">
            <Select
              value={timingUi ?? ''}
              onValueChange={(v) => {
                setTimingUi(isTimingUi(v) ? v : undefined);
                goNext(notesBtnRef.current);
              }}
            >
              <SelectTrigger
                ref={timingTriggerRef}
                className="h-10 rounded-xl cursor-pointer"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  if (timingUi) {
                    e.preventDefault();
                    goNext(notesBtnRef.current);
                  }
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

          <div className="w-[16.666%] pl-2">
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
                  className="min-h-[90px] resize-none rounded-xl"
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

          <div className="w-[8.333%] pr-4">
            <div className="flex justify-end">
              <Button
                ref={addBtnRef}
                type="button"
                className="h-10 w-10 rounded-xl cursor-pointer"
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
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div className="w-[24%]">
            <Input
              ref={doseRef}
              className="h-9 rounded-xl"
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="Dose"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                goNext(freqTriggerRef.current);
              }}
            />
          </div>
          <div className="flex-1" />
        </div>
      </div>

      <div className="flex items-center gap-2 border-b bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-600">
        <div className="w-[25%]">Medicine</div>
        <div className="w-[16.666%]">Frequency</div>
        <div className="w-[16.666%]">Duration</div>
        <div className="w-[16.666%] pl-2">Timing</div>
        <div className="w-[16.666%] pl-5">Notes</div>
        <div className="w-[8.333%]">Actions</div>
      </div>

      <div
        className={[
          'divide-y',
          shouldScroll ? 'max-h-[200px] 2xl:max-h-full overflow-y-auto' : '',
          'dms-scroll',
        ].join(' ')}
      >
        {lines.length === 0 ? (
          <div className="px-3 py-6 text-sm text-gray-500">No medicines added yet.</div>
        ) : (
          lines.map((l, idx) => (
            <div key={idx} className="flex items-start gap-2 px-3 py-1 text-sm">
              <div className="w-[25%]">
                <div className="font-medium text-gray-900">{l.medicine}</div>
                <div className="text-[12px] text-gray-500">{l.dose}</div>
              </div>

              <div className="w-[16.666%] pl-3 text-gray-800">{l.frequency}</div>
              <div className="w-[16.666%] text-gray- pl-3">{l.duration}</div>
              <div className="w-[16.666%] pl-2 text-gray-800">{timingLabel(l.timing)}</div>

              <div className="w-[16.666%]">
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
                      View
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent side="bottom" align="start" className="w-80 rounded-2xl p-3">
                    <div className="mb-2 text-sm font-semibold text-gray-900">Notes</div>
                    <Textarea
                      className="min-h-[90px] resize-none rounded-xl"
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

              <div className="w-[8.333%]">
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
          ))
        )}
      </div>
    </div>
  );
}
