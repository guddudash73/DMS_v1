'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { BillingCheckoutInput } from '@dms/types';

import {
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetVisitBillQuery,
  useCheckoutVisitMutation,
} from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';

type LineDraft = { description: string; unitAmount: number };

const money = (n: unknown) => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
};

function IconPlus(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IconPen(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconX(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function VisitCheckoutBillingPage() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();
  const auth = useAuth();
  const role = auth.status === 'authenticated' ? auth.role : undefined;
  const isAdmin = role === 'ADMIN';

  const visitId = String(params?.visitId ?? '');

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const visit = visitQuery.data;

  const patientId = visit?.patientId;
  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !patientId });

  const billQuery = useGetVisitBillQuery({ visitId }, { skip: !visitId });
  const bill = billQuery.data ?? null;
  const billNotFound = (billQuery as any)?.error?.status === 404;

  React.useEffect(() => {
    if (!visitId) return;
    if (billQuery.isLoading || billQuery.isFetching) return;
    if (bill && !isAdmin) {
      router.replace(`/visits/${visitId}/checkout/printing`);
    }
  }, [bill, isAdmin, visitId, router, billQuery.isLoading, billQuery.isFetching]);

  const isZeroBilled = (visit?.tag ?? undefined) === 'Z';
  const canCheckout = !!visitId && !!visit && visit.status === 'DONE';

  const [checkoutVisit, checkoutState] = useCheckoutVisitMutation();

  const [lines, setLines] = React.useState<LineDraft[]>([]);
  const [discountAmount, setDiscountAmount] = React.useState(0);
  const [taxAmount, setTaxAmount] = React.useState(0);

  const [serviceDraft, setServiceDraft] = React.useState('');
  const [amountDraft, setAmountDraft] = React.useState('');

  const [editIndex, setEditIndex] = React.useState<number | null>(null);
  const [editService, setEditService] = React.useState('');
  const [editAmount, setEditAmount] = React.useState('');

  const hydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (!bill) return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    setLines(
      (bill.items ?? []).map((it) => ({
        description: it.description,
        unitAmount: it.unitAmount,
      })),
    );
    setDiscountAmount(bill.discountAmount ?? 0);
    setTaxAmount(bill.taxAmount ?? 0);
  }, [bill]);

  const computed = React.useMemo(() => {
    if (isZeroBilled) {
      return { subtotal: 0, discount: 0, tax: 0, total: 0, safeLines: [] as LineDraft[] };
    }

    const safeLines = lines
      .map((l) => ({
        description: (l.description ?? '').trim(),
        unitAmount: Math.max(0, money(l.unitAmount)),
      }))
      .filter((l) => l.description.length > 0);

    const subtotal = safeLines.reduce((sum, l) => sum + l.unitAmount, 0);
    const discount = Math.max(0, money(discountAmount));
    const tax = Math.max(0, money(taxAmount));
    const total = Math.max(0, subtotal - Math.min(discount, subtotal) + tax);

    return { subtotal, discount, tax, total, safeLines };
  }, [lines, discountAmount, taxAmount, isZeroBilled]);

  const patientName = patientQuery.data?.name;
  const patientPhone = patientQuery.data?.phone;

  // ✅ Visit no longer guarantees doctorId. Keep legacy support.
  const legacyDoctorId =
    (visit as any)?.doctorId ??
    (visit as any)?.providerId ??
    (visit as any)?.assignedDoctorId ??
    undefined;

  const doctorLabel = legacyDoctorId ? `Doctor (${legacyDoctorId})` : 'Doctor';
  const visitDateLabel = visit?.visitDate ? visit.visitDate : '—';

  const billingMuted = isZeroBilled;

  const serviceRef = React.useRef<HTMLInputElement | null>(null);
  const amountRef = React.useRef<HTMLInputElement | null>(null);
  const addBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const editServiceRef = React.useRef<HTMLInputElement | null>(null);
  const editAmountRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    requestAnimationFrame(() => serviceRef.current?.focus());
  }, []);

  const addLineFromDraft = () => {
    if (billingMuted) return;

    const desc = serviceDraft.trim();
    const amt = Math.max(0, money(amountDraft));

    if (!desc) {
      toast.info('Enter a service name.');
      serviceRef.current?.focus();
      return;
    }

    setLines((prev) => [...prev, { description: desc, unitAmount: amt }]);
    setServiceDraft('');
    setAmountDraft('');
    requestAnimationFrame(() => serviceRef.current?.focus());
  };

  const startEdit = (idx: number) => {
    if (billingMuted) return;
    const row = lines[idx];
    setEditIndex(idx);
    setEditService(row?.description ?? '');
    setEditAmount(String(row?.unitAmount ?? 0));
    requestAnimationFrame(() => editServiceRef.current?.focus());
  };

  const commitEdit = () => {
    if (editIndex === null) return;

    const desc = editService.trim();
    const amt = Math.max(0, money(editAmount));

    if (!desc) {
      toast.info('Service name cannot be empty.');
      editServiceRef.current?.focus();
      return;
    }

    setLines((prev) =>
      prev.map((x, i) => (i === editIndex ? { description: desc, unitAmount: amt } : x)),
    );
    setEditIndex(null);
    setEditService('');
    setEditAmount('');
    requestAnimationFrame(() => serviceRef.current?.focus());
  };

  const cancelEdit = () => {
    setEditIndex(null);
    setEditService('');
    setEditAmount('');
    requestAnimationFrame(() => serviceRef.current?.focus());
  };

  const removeLine = (idx: number) => {
    if (billingMuted) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
    requestAnimationFrame(() => serviceRef.current?.focus());
  };

  const onSave = async () => {
    if (!visit) return;

    if (visit.status !== 'DONE') {
      toast.error('Checkout is only allowed when visit is DONE.');
      return;
    }

    const payload: BillingCheckoutInput = {
      items: computed.safeLines.length
        ? computed.safeLines.map((l) => ({
            description: l.description,
            quantity: 1,
            unitAmount: l.unitAmount,
          }))
        : [{ description: 'Consultation', quantity: 1, unitAmount: 0 }],
      discountAmount: isZeroBilled ? 0 : computed.discount,
      taxAmount: isZeroBilled ? 0 : computed.tax,
    };

    try {
      await checkoutVisit({ visitId, input: payload }).unwrap();
      toast.success(bill ? 'Bill updated.' : 'Checkout saved.');
      router.replace(`/visits/${visitId}/checkout/printing`);
    } catch (err: any) {
      const code = err?.data?.error;
      const msg = err?.data?.message ?? err?.message ?? 'Checkout failed.';
      if (code === 'VISIT_NOT_DONE') toast.error('Visit must be DONE before checkout.');
      else if (code === 'DUPLICATE_CHECKOUT') toast.error('This visit is already checked out.');
      else toast.error(msg);
    }
  };

  if (bill && !isAdmin) return <div className="p-6 text-sm text-gray-600">Redirecting…</div>;

  return (
    <section className="p-4 2xl:p-8">
      {/* ...rest unchanged... */}
      {/* (Your existing JSX below is unchanged; only doctorLabel logic was fixed.) */}

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold text-gray-900">
            {bill ? 'Edit Bill' : 'Billing'}
          </div>
          <div className="text-xs text-gray-500">
            Visit ID: {visitId} · Tag: {visit?.tag ?? '—'} · Status: {visit?.status ?? '—'}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => router.back()}
          >
            Back
          </Button>

          <Button
            type="button"
            variant="default"
            className="rounded-xl bg-black text-white hover:bg-black/90"
            onClick={() => void onSave()}
            disabled={!canCheckout || checkoutState.isLoading}
          >
            {checkoutState.isLoading ? 'Saving…' : bill ? 'Save changes' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-gray-500">Patient</div>
          <div className="mt-1 text-base font-semibold text-gray-900">{patientName ?? '—'}</div>
          <div className="mt-1 text-sm text-gray-600">{patientPhone ?? '—'}</div>
        </Card>

        <Card className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-gray-500">Doctor</div>
          <div className="mt-1 text-base font-semibold text-gray-900">{doctorLabel}</div>
          <div className="mt-1 text-sm text-gray-600">{visitDateLabel}</div>
        </Card>

        <Card className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-gray-500">Bill status</div>
          <div className="mt-2">
            {bill ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                Checked out
              </span>
            ) : billNotFound ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                Not checked out
              </span>
            ) : billQuery.isLoading ? (
              <span className="rounded-full border px-2 py-1 text-xs font-semibold text-gray-700">
                Loading…
              </span>
            ) : null}
          </div>

          {isZeroBilled ? (
            <div className="mt-2 text-xs text-gray-500">
              Tag <span className="font-semibold">Z</span> → zero-billed visit. Billing is muted.
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="rounded-2xl border bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="w-full">
            <div className="text-xs text-gray-500">Total</div>
            <div className="mt-1 text-3xl font-extrabold text-gray-900">
              {computed.total.toFixed(2)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Subtotal {computed.subtotal.toFixed(2)} · Discount {computed.discount.toFixed(2)} ·
              Tax {computed.tax.toFixed(2)}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full justify-end">
            <div className="rounded-xl border bg-white px-3 py-2">
              <div className="text-[11px] text-gray-500">Discount</div>
              <Input
                className="mt-1 h-9 rounded-xl"
                inputMode="decimal"
                value={String(discountAmount)}
                onChange={(e) => setDiscountAmount(Number(e.target.value || 0))}
                disabled={billingMuted}
              />
            </div>

            <div className="rounded-xl border bg-white px-3 py-2">
              <div className="text-[11px] text-gray-500">Tax</div>
              <Input
                className="mt-1 h-9 rounded-xl"
                inputMode="decimal"
                value={String(taxAmount)}
                onChange={(e) => setTaxAmount(Number(e.target.value || 0))}
                disabled={billingMuted}
              />
            </div>
          </div>
        </div>

        <div
          className={[
            'mt-2 rounded-2xl border bg-gray-50 p-4',
            billingMuted ? 'opacity-50 pointer-events-none select-none' : '',
          ].join(' ')}
        >
          <div className="flex gap-3 items-end">
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
                placeholder="0"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addBtnRef.current?.focus();
                  }
                }}
              />
            </div>

            <div className="flex">
              <Button
                ref={addBtnRef}
                type="button"
                variant="default"
                className="w-11 rounded-xl bg-black p-0 text-white hover:bg-black/90"
                onClick={addLineFromDraft}
                title="Add"
              >
                <IconPlus className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-2 space-y-2">
          {lines.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-gray-50 p-6 text-sm text-gray-600">
              No services added yet. Add a service and amount above.
            </div>
          ) : (
            lines.map((l, idx) => {
              const isEditing = editIndex === idx;

              return (
                <div key={`${idx}-${l.description}`} className="rounded-2xl border bg-white p-4">
                  {isEditing ? (
                    <div className="grid grid-cols-12 items-end gap-3">
                      <div className="col-span-12 md:col-span-7">
                        <Label className="text-xs text-gray-600">Service</Label>
                        <Input
                          ref={editServiceRef}
                          className="mt-1 h-10 rounded-xl"
                          value={editService}
                          onChange={(e) => setEditService(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              editAmountRef.current?.focus();
                            }
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          disabled={billingMuted}
                        />
                      </div>

                      <div className="col-span-10 md:col-span-4">
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
                          disabled={billingMuted}
                        />
                      </div>

                      <div className="col-span-2 md:col-span-1 flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="default"
                          className="h-10 rounded-xl bg-black text-white hover:bg-black/90"
                          onClick={commitEdit}
                          disabled={billingMuted}
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
                          {l.description || '—'}
                        </div>
                        <div className="text-xs text-gray-500">Amount</div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="tabular-nums text-base font-bold text-gray-900">
                          {money(l.unitAmount).toFixed(2)}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            onClick={() => startEdit(idx)}
                            disabled={billingMuted}
                            title="Edit"
                          >
                            <IconPen className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            onClick={() => removeLine(idx)}
                            disabled={billingMuted}
                            title="Delete"
                          >
                            <IconX className="h-4 w-4" />
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

        <div className="mt-4 rounded-2xl border border-dashed bg-gray-50 p-4 text-sm text-gray-600">
          Tip: Enter → Amount, Enter → Add, Enter → Next service.
        </div>
      </Card>
    </section>
  );
}
