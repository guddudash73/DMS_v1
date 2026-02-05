'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

import { Pencil, Trash2, Plus, Search, Loader2, Lock, Check, ChevronsUpDown } from 'lucide-react';

import type { MedicinePreset } from '@dcm/types';

import {
  useGetMeQuery,
  useListMedicinesCatalogQuery,
  useQuickAddMedicineMutation,
  useDoctorUpdateMedicineMutation,
  useDoctorDeleteMedicineMutation,
} from '@/src/store/api';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

const FREQUENCIES = ['QD', 'BID', 'TID', 'QID', 'HS', 'PRN'] as const;
type Frequency = (typeof FREQUENCIES)[number];

/**
 * ✅ medicineType is a free string in backend (z.string().min(1).max(64)),
 * but UI uses a common dropdown + allows "Use typed".
 * Keep consistent with MedicinesEditor.tsx.
 */
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

type FormState = {
  displayName: string;
  defaultDose?: string;
  defaultFrequency?: Frequency | '';
  defaultDuration?: number;
  medicineType?: string;
};

const emptyForm = (): FormState => ({
  displayName: '',
  defaultDose: '',
  defaultFrequency: '',
  defaultDuration: undefined,
  medicineType: '',
});

const toNumberOrUndef = (v: string) => {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

const isFrequency = (v: unknown): v is Frequency =>
  typeof v === 'string' && (FREQUENCIES as readonly string[]).includes(v as Frequency);

function SelectLike({
  value,
  onChange,
  children,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  placeholder?: string;
}) {
  return (
    <select
      className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring/50"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {children}
    </select>
  );
}

const formatDefaults = (m: MedicinePreset) => {
  const type = m.medicineType?.trim() ? m.medicineType : '—';
  const dose = m.defaultDose?.trim() ? m.defaultDose : '—';
  const freq = m.defaultFrequency?.trim() ? m.defaultFrequency : '—';
  const dur = typeof m.defaultDuration === 'number' ? `${m.defaultDuration}d` : '—';
  return { type, dose, freq, dur };
};

type MedicinesCatalogListArgs = {
  query?: string;
  limit: number;
  cursor?: string;
};

/**
 * ✅ MedicineType combobox:
 * - dropdown of common categories
 * - searchable
 * - allow "Use typed"
 */
function MedicineTypeCombobox({
  value,
  onChange,
  placeholder = 'Type —',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(value);

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
          variant="outline"
          role="combobox"
          className="h-10 w-full justify-between rounded-xl"
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

export default function DoctorMedicinesPage() {
  const meQ = useGetMeQuery();
  const myUserId = meQ.data?.userId ?? '';

  const [searchTerm, setSearchTerm] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(searchTerm.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchTerm]);

  const [cursor, setCursor] = React.useState<string | null>(null);
  const [cursorStack, setCursorStack] = React.useState<string[]>([]);
  React.useEffect(() => {
    setCursor(null);
    setCursorStack([]);
  }, [debounced]);

  const listArgs: MedicinesCatalogListArgs = {
    query: debounced || undefined,
    limit: 12,
    cursor: cursor || undefined,
  };

  const listQ = useListMedicinesCatalogQuery(listArgs, { refetchOnMountOrArgChange: true });

  const items = listQ.data?.items ?? [];
  const nextCursor = listQ.data?.nextCursor ?? null;

  const canPrev = cursorStack.length > 0;
  const canNext = !!nextCursor;

  const onPrev = () => {
    setCursorStack((prev) => {
      const next = [...prev];
      const prevCursor = next.pop() ?? null;
      setCursor(prevCursor);
      return next;
    });
  };

  const onNext = () => {
    if (!nextCursor) return;
    setCursorStack((prev) => [...prev, cursor ?? '']);
    setCursor(nextCursor);
  };

  const [quickAdd, quickAddState] = useQuickAddMedicineMutation();
  const [doctorUpdate, updateState] = useDoctorUpdateMedicineMutation();
  const [doctorDelete, deleteState] = useDoctorDeleteMedicineMutation();

  const [addOpen, setAddOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);

  const [addForm, setAddForm] = React.useState<FormState>(() => emptyForm());
  const [editForm, setEditForm] = React.useState<FormState>(() => emptyForm());
  const [editTarget, setEditTarget] = React.useState<MedicinePreset | null>(null);

  const busy =
    listQ.isLoading || quickAddState.isLoading || updateState.isLoading || deleteState.isLoading;

  const canMutate = (m: MedicinePreset) =>
    !!myUserId && m.createdByUserId === myUserId && m.source === 'INLINE_DOCTOR';

  const openEdit = (m: MedicinePreset) => {
    setEditTarget(m);

    const freq =
      m.defaultFrequency && isFrequency(m.defaultFrequency) ? m.defaultFrequency : ('' as const);

    setEditForm({
      displayName: m.displayName ?? '',
      defaultDose: m.defaultDose ?? '',
      defaultFrequency: freq,
      defaultDuration: m.defaultDuration,
      medicineType: m.medicineType ?? '',
    });

    setEditOpen(true);
  };

  const onAdd = async () => {
    const name = addForm.displayName.trim();
    if (!name) return;

    const mt = (addForm.medicineType ?? '').trim();

    await quickAdd({
      displayName: name,
      defaultDose: addForm.defaultDose?.trim() || undefined,
      defaultFrequency: addForm.defaultFrequency?.trim() || undefined,
      defaultDuration: addForm.defaultDuration,
      medicineType: mt ? mt : undefined,
    }).unwrap();

    setAddOpen(false);
    setAddForm(emptyForm());
  };

  const onEdit = async () => {
    if (!editTarget) return;
    if (!canMutate(editTarget)) return;

    const name = editForm.displayName.trim();
    if (!name) return;

    const mt = (editForm.medicineType ?? '').trim();

    await doctorUpdate({
      id: editTarget.id,
      patch: {
        displayName: name,
        defaultDose: editForm.defaultDose?.trim() || undefined,
        defaultFrequency: editForm.defaultFrequency?.trim() || undefined,
        defaultDuration: editForm.defaultDuration,
        medicineType: mt ? mt : undefined,
      },
    }).unwrap();

    setEditOpen(false);
    setEditTarget(null);
  };

  const onDelete = async (m: MedicinePreset) => {
    if (!canMutate(m)) return;
    const ok = window.confirm(`Delete medicine "${m.displayName}"? This cannot be undone.`);
    if (!ok) return;
    await doctorDelete({ id: m.id }).unwrap();
  };

  return (
    <div className="p-4 2xl:p-12">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xl font-semibold text-gray-900">Medicines</div>
          <p className="mt-1 text-sm text-gray-600">
            You can view all medicines. You can edit/delete only medicines created by you.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              className="h-9 rounded-xl pl-9 text-sm"
              placeholder="Search medicines by name…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Button className="h-9 rounded-xl" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Medicine
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border bg-white p-0 shadow-none">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Medicine Catalog</div>
            <div className="text-[11px] text-gray-500">
              Showing: <span className="font-medium text-gray-700">{debounced || 'All'}</span>
            </div>
          </div>

          {listQ.isLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold text-gray-600">
              <tr>
                <th className="px-5 py-3">Display Name</th>
                <th className="px-5 py-3">Defaults</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {!listQ.isLoading && items.length === 0 && (
                <tr>
                  <td className="px-5 py-6 text-sm text-gray-500" colSpan={5}>
                    No medicines found.
                  </td>
                </tr>
              )}

              {items.map((m) => {
                const d = formatDefaults(m);
                const mine = canMutate(m);

                return (
                  <tr key={m.id} className="align-top">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-gray-900">{m.displayName}</div>
                      <div className="mt-0.5 text-[11px] text-gray-500">ID: {m.id}</div>
                      {m.medicineType?.trim() ? (
                        <div className="mt-1">
                          <Badge variant="secondary" className="rounded-full text-[10px]">
                            {m.medicineType}
                          </Badge>
                        </div>
                      ) : null}
                      {mine ? (
                        <div className="mt-1 text-[11px] font-medium text-emerald-700">Yours</div>
                      ) : null}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-gray-700">
                      <div>Type: {d.type}</div>
                      <div>Dose: {d.dose}</div>
                      <div>Freq: {d.freq}</div>
                      <div>Dur: {d.dur}</div>
                    </td>

                    <td className="px-5 py-4 text-[11px] text-gray-700">{m.source}</td>

                    <td className="px-5 py-4">
                      <Badge className="rounded-full text-[10px]" variant="secondary">
                        {m.verified ? 'Verified' : 'Unverified'}
                      </Badge>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {mine ? (
                          <>
                            <Button
                              variant="secondary"
                              className="h-9 rounded-xl"
                              onClick={() => openEdit(m)}
                              disabled={busy}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </Button>

                            <Button
                              variant="destructive"
                              className="h-9 rounded-xl"
                              onClick={() => onDelete(m)}
                              disabled={busy}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 text-[11px] text-gray-500">
                            <Lock className="h-4 w-4" />
                            Read only
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button
            variant="secondary"
            className="h-9 rounded-xl"
            disabled={!canPrev}
            onClick={onPrev}
          >
            Prev
          </Button>
          <Button
            variant="secondary"
            className="h-9 rounded-xl"
            disabled={!canNext}
            onClick={onNext}
          >
            Next
          </Button>
        </div>
      </Card>

      {/* ADD */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add medicine</DialogTitle>
            <DialogDescription>Create a medicine preset (this will be yours).</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-xs">Display name</Label>
              <Input
                className="rounded-xl"
                placeholder="e.g., Amoxicillin 500mg"
                value={addForm.displayName}
                onChange={(e) => setAddForm((p) => ({ ...p, displayName: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-xs">Type (medicineType)</Label>
              <MedicineTypeCombobox
                value={addForm.medicineType ?? ''}
                onChange={(v) => setAddForm((p) => ({ ...p, medicineType: v }))}
                placeholder="Type —"
              />
              <div className="text-[11px] text-gray-500">Optional.</div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label className="text-xs">Dose</Label>
                <Input
                  className="rounded-xl"
                  placeholder="e.g., 500mg"
                  value={addForm.defaultDose ?? ''}
                  onChange={(e) => setAddForm((p) => ({ ...p, defaultDose: e.target.value }))}
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-xs">Frequency</Label>
                <SelectLike
                  value={addForm.defaultFrequency ?? ''}
                  onChange={(v) =>
                    setAddForm((p) => ({ ...p, defaultFrequency: isFrequency(v) ? v : '' }))
                  }
                  placeholder="Select…"
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </SelectLike>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs">Duration (days)</Label>
                <Input
                  className="rounded-xl"
                  inputMode="numeric"
                  placeholder="e.g., 5"
                  value={
                    typeof addForm.defaultDuration === 'number'
                      ? String(addForm.defaultDuration)
                      : ''
                  }
                  onChange={(e) =>
                    setAddForm((p) => ({ ...p, defaultDuration: toNumberOrUndef(e.target.value) }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="secondary" className="rounded-xl" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              onClick={onAdd}
              disabled={quickAddState.isLoading || !addForm.displayName.trim()}
            >
              {quickAddState.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit medicine</DialogTitle>
            <DialogDescription>Update name and default values.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-xs">Display name</Label>
              <Input
                className="rounded-xl"
                value={editForm.displayName}
                onChange={(e) => setEditForm((p) => ({ ...p, displayName: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-xs">Type (medicineType)</Label>
              <MedicineTypeCombobox
                value={editForm.medicineType ?? ''}
                onChange={(v) => setEditForm((p) => ({ ...p, medicineType: v }))}
                placeholder="Type —"
              />
              <div className="text-[11px] text-gray-500">Optional.</div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label className="text-xs">Dose</Label>
                <Input
                  className="rounded-xl"
                  value={editForm.defaultDose ?? ''}
                  onChange={(e) => setEditForm((p) => ({ ...p, defaultDose: e.target.value }))}
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-xs">Frequency</Label>
                <SelectLike
                  value={editForm.defaultFrequency ?? ''}
                  onChange={(v) =>
                    setEditForm((p) => ({ ...p, defaultFrequency: isFrequency(v) ? v : '' }))
                  }
                  placeholder="Select…"
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </SelectLike>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs">Duration (days)</Label>
                <Input
                  className="rounded-xl"
                  inputMode="numeric"
                  value={
                    typeof editForm.defaultDuration === 'number'
                      ? String(editForm.defaultDuration)
                      : ''
                  }
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, defaultDuration: toNumberOrUndef(e.target.value) }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              className="rounded-xl"
              onClick={() => {
                setEditOpen(false);
                setEditTarget(null);
              }}
            >
              Cancel
            </Button>

            <Button
              className="rounded-xl"
              onClick={onEdit}
              disabled={updateState.isLoading || !editForm.displayName.trim()}
            >
              {updateState.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
