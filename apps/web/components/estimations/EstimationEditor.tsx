'use client';

import * as React from 'react';
import type { Estimation, EstimationCreateRequest } from '@dcm/types';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type LineDraft = {
  description: string;
  quantity: number;
  unitAmount: number; // user enters unit price
};

/* ------------------ Utils ------------------ */

const money = (n: unknown) => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
};

const intQty = (n: unknown) => {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.max(1, Math.floor(v));
};

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clampNonNeg(n: number) {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/* ------------------ Component ------------------ */

export function EstimationEditor(props: {
  title: string;
  patientName?: string;
  initial?: Partial<Estimation>;
  submitting?: boolean;
  onSubmit: (body: EstimationCreateRequest) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const { title, patientName, initial, submitting, onSubmit, onCancel } = props;

  const [lines, setLines] = React.useState<LineDraft[]>(() =>
    initial?.items?.length
      ? initial.items.map((it) => {
          const qty = intQty(it.quantity ?? 1);
          const lineTotal = clampNonNeg(money((it as any).amount));
          const unit = qty > 0 ? lineTotal / qty : lineTotal;

          return {
            description: String(it.description ?? ''),
            quantity: qty,
            unitAmount: clampNonNeg(unit),
          };
        })
      : [],
  );

  const [serviceDraft, setServiceDraft] = React.useState('');
  const [qtyDraft, setQtyDraft] = React.useState('1');
  const [amountDraft, setAmountDraft] = React.useState(''); // unit price input

  const [editIndex, setEditIndex] = React.useState<number | null>(null);
  const [editService, setEditService] = React.useState('');
  const [editQty, setEditQty] = React.useState('1');
  const [editAmount, setEditAmount] = React.useState(''); // unit price input

  const [notes, setNotes] = React.useState(initial?.notes ?? '');
  const [validUntil, setValidUntil] = React.useState(initial?.validUntil ?? '');

  /* ------------------ Refs ------------------ */

  const serviceRef = React.useRef<HTMLInputElement | null>(null);
  const qtyRef = React.useRef<HTMLInputElement | null>(null);
  const amountRef = React.useRef<HTMLInputElement | null>(null);
  const addBtnRef = React.useRef<HTMLButtonElement | null>(null);

  const editServiceRef = React.useRef<HTMLInputElement | null>(null);
  const editQtyRef = React.useRef<HTMLInputElement | null>(null);
  const editAmountRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    requestAnimationFrame(() => serviceRef.current?.focus());
  }, []);

  /* ------------------ Computed ------------------ */

  const computedTotal = React.useMemo(() => {
    return lines.reduce((sum, l) => {
      const q = intQty(l.quantity);
      const unit = clampNonNeg(money(l.unitAmount));
      return sum + q * unit;
    }, 0);
  }, [lines]);

  const canSubmit =
    !submitting &&
    lines.length > 0 &&
    lines.every((l) => l.description.trim().length > 0 && intQty(l.quantity) >= 1);

  /* ------------------ Actions ------------------ */

  const addLineFromDraft = () => {
    const desc = serviceDraft.trim();
    const qty = intQty(qtyDraft);
    const unit = clampNonNeg(money(amountDraft));

    if (!desc) {
      serviceRef.current?.focus();
      return;
    }

    setLines((prev) => [...prev, { description: desc, quantity: qty, unitAmount: unit }]);
    setServiceDraft('');
    setQtyDraft('1');
    setAmountDraft('');
    requestAnimationFrame(() => serviceRef.current?.focus());
  };

  const startEdit = (idx: number) => {
    const row = lines[idx];
    setEditIndex(idx);
    setEditService(row.description);
    setEditQty(String(row.quantity));
    setEditAmount(String(row.unitAmount));
    requestAnimationFrame(() => editServiceRef.current?.focus());
  };

  const commitEdit = () => {
    if (editIndex === null) return;

    const desc = editService.trim();
    const qty = intQty(editQty);
    const unit = clampNonNeg(money(editAmount));

    if (!desc) {
      editServiceRef.current?.focus();
      return;
    }

    setLines((prev) =>
      prev.map((l, i) =>
        i === editIndex ? { description: desc, quantity: qty, unitAmount: unit } : l,
      ),
    );

    setEditIndex(null);
    setEditService('');
    setEditQty('1');
    setEditAmount('');
    requestAnimationFrame(() => serviceRef.current?.focus());
  };

  const cancelEdit = () => {
    setEditIndex(null);
    setEditService('');
    setEditQty('1');
    setEditAmount('');
    requestAnimationFrame(() => serviceRef.current?.focus());
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
    requestAnimationFrame(() => serviceRef.current?.focus());
  };

  const submit = async () => {
    const body: EstimationCreateRequest = {
      items: lines.map((l) => {
        const qty = intQty(l.quantity);
        const unit = clampNonNeg(money(l.unitAmount));
        const lineTotal = qty * unit;

        return {
          description: l.description.trim(),
          quantity: qty,
          amount: lineTotal, // ✅ correct: qty × unit price
        };
      }),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(validUntil.trim() ? { validUntil: validUntil.trim() } : {}),
    };

    await onSubmit(body);
  };

  /* ------------------ Render ------------------ */

  return (
    <Card className="rounded-2xl border bg-white p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-gray-900">{title}</div>

          {patientName ? (
            <div className="mt-1 text-sm text-gray-600">
              Patient: <span className="font-semibold text-gray-900">{patientName}</span>
            </div>
          ) : null}

          <div className="mt-1 text-xs text-gray-500">Add services and estimate total cost</div>
        </div>

        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="outline" className="rounded-xl" onClick={onCancel}>
              Cancel
            </Button>
          )}

          <Button
            type="button"
            className="rounded-xl bg-black text-white hover:bg-black/90"
            disabled={!canSubmit}
            onClick={submit}
          >
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Total */}
      <div className="mb-4">
        <div className="text-xs text-gray-500">Total</div>
        <div className="text-3xl font-extrabold text-gray-900">{computedTotal.toFixed(2)}</div>
      </div>

      {/* Draft row */}
      <div className="rounded-2xl border bg-gray-50 p-4">
        <div className="flex items-end gap-3">
          <div className="w-full">
            <Label className="text-xs text-gray-600">Service</Label>
            <Input
              ref={serviceRef}
              className="mt-1 h-11 rounded-xl bg-white"
              value={serviceDraft}
              onChange={(e) => setServiceDraft(e.target.value)}
              placeholder="e.g. Consultation / Filling / Extraction"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  qtyRef.current?.focus();
                }
              }}
            />
          </div>

          <div className="w-28">
            <Label className="text-xs text-gray-600">Qty</Label>
            <Input
              ref={qtyRef}
              className="mt-1 h-11 rounded-xl bg-white"
              inputMode="numeric"
              value={qtyDraft}
              onChange={(e) => setQtyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  amountRef.current?.focus();
                }
              }}
            />
          </div>

          <div className="w-full">
            <Label className="text-xs text-gray-600">Amount</Label>
            <Input
              ref={amountRef}
              className="mt-1 h-11 rounded-xl bg-white"
              inputMode="decimal"
              value={amountDraft}
              onChange={(e) => setAmountDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addBtnRef.current?.focus();
                }
              }}
            />
          </div>

          <Button
            ref={addBtnRef}
            type="button"
            className="h-11 w-11 rounded-xl bg-black p-0 text-white hover:bg-black/90"
            onClick={addLineFromDraft}
          >
            +
          </Button>
        </div>
      </div>

      {/* Lines */}
      <div className="mt-3 space-y-2">
        {lines.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-gray-50 p-6 text-sm text-gray-600">
            No services added yet.
          </div>
        ) : (
          lines.map((l, idx) => {
            const isEditing = editIndex === idx;
            const q = intQty(l.quantity);
            const ua = clampNonNeg(money(l.unitAmount));
            const lineTotal = q * ua;

            return (
              <div key={idx} className="rounded-2xl border bg-white p-4">
                {isEditing ? (
                  <div className="grid grid-cols-12 items-end gap-3">
                    <div className="col-span-12 md:col-span-6">
                      <Label className="text-xs text-gray-600">Service</Label>
                      <Input
                        ref={editServiceRef}
                        className="mt-1 h-10 rounded-xl"
                        value={editService}
                        onChange={(e) => setEditService(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            editQtyRef.current?.focus();
                          }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                      />
                    </div>

                    <div className="col-span-6 md:col-span-2">
                      <Label className="text-xs text-gray-600">Qty</Label>
                      <Input
                        ref={editQtyRef}
                        className="mt-1 h-10 rounded-xl"
                        inputMode="numeric"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            editAmountRef.current?.focus();
                          }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                      />
                    </div>

                    <div className="col-span-6 md:col-span-2">
                      <Label className="text-xs text-gray-600">Amount</Label>
                      <Input
                        ref={editAmountRef}
                        className="mt-1 h-10 rounded-xl"
                        inputMode="decimal"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitEdit();
                          }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                      />
                    </div>

                    <div className="col-span-12 md:col-span-2 flex gap-2">
                      <Button
                        type="button"
                        className="h-10 rounded-xl bg-black text-white hover:bg-black/90"
                        onClick={commitEdit}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-xl"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">
                        {l.description}
                      </div>
                      <div className="text-xs text-gray-500">
                        Qty {q} × {ua.toFixed(2)}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="tabular-nums text-base font-bold text-gray-900">
                        {lineTotal.toFixed(2)}
                      </div>

                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="h-9 w-9 rounded-xl border hover:bg-gray-50"
                          onClick={() => startEdit(idx)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="h-9 w-9 rounded-xl border hover:bg-gray-50"
                          onClick={() => removeLine(idx)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 rounded-2xl border border-dashed bg-gray-50 p-4 text-sm text-gray-600">
        Tip: Enter → Qty, Enter → Amount, Enter → Add, Enter → Next service.
      </div>

      {/* Meta */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <Label className="text-xs text-gray-700">Valid Until (optional)</Label>
          <Input
            type="date"
            className="mt-1 rounded-xl bg-white"
            value={validUntil}
            min={toISODate(new Date(2000, 0, 1))}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </div>

        <div>
          <Label className="text-xs text-gray-700">Notes (optional)</Label>
          <Textarea
            className="mt-1 min-h-[96px] rounded-xl"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Card>
  );
}
