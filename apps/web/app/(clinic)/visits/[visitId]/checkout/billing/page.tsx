'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { BillingCheckoutInput } from '@dcm/types';

import {
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetVisitBillQuery,
  useUpdateVisitBillMutation,
  useCheckoutVisitMutation,
  useUpdateVisitStatusMutation,
} from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';

type LineDraft = { description: string; quantity: number; unitAmount: number };

const money = (n: unknown) => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
};

const intQty = (n: unknown) => {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.max(1, Math.floor(v));
};

type UnknownRecord = Record<string, unknown>;
const isRecord = (v: unknown): v is UnknownRecord => typeof v === 'object' && v !== null;

const getStr = (obj: unknown, key: string): string | undefined => {
  if (!isRecord(obj)) return undefined;
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
};

const getBool = (obj: unknown, key: string): boolean | undefined => {
  if (!isRecord(obj)) return undefined;
  const v = obj[key];
  return typeof v === 'boolean' ? v : undefined;
};

const getNum = (obj: unknown, key: string): number | undefined => {
  if (!isRecord(obj)) return undefined;
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

const getErrorMessage = (err: unknown): string | undefined => {
  if (err instanceof Error) return err.message;
  if (isRecord(err) && typeof err.message === 'string') return err.message;
  return undefined;
};

type ApiError = { status?: number; data?: unknown };

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

type BillItemLike = { description?: unknown; unitAmount?: unknown; quantity?: unknown };
type BillLike = {
  items?: unknown;
  discountAmount?: unknown;
  taxAmount?: unknown;
  receivedOnline?: unknown;
  receivedOffline?: unknown;
};

const getBillItems = (bill: unknown): BillItemLike[] => {
  if (!isRecord(bill)) return [];
  const b = bill as BillLike;
  if (!Array.isArray(b.items)) return [];
  return b.items as BillItemLike[];
};

// ---- Visit summary helpers (same idea as printing page) ----
type PatientSex = 'M' | 'F' | 'O' | 'U';

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function safeParseDobToDate(dob: unknown): Date | null {
  if (!dob) return null;

  if (typeof dob === 'number' && Number.isFinite(dob)) {
    const d = new Date(dob);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  if (typeof dob === 'string') {
    const s = dob.trim();
    if (!s) return null;

    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const da = Number(m[3]);
      const d = new Date(y, mo, da);
      return Number.isFinite(d.getTime()) ? d : null;
    }

    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  if (dob instanceof Date) return Number.isFinite(dob.getTime()) ? dob : null;

  return null;
}

function calculateAge(dob: Date, at: Date): number {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age -= 1;
  return age < 0 ? 0 : age;
}

function normalizeSex(raw: unknown): PatientSex | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim().toUpperCase();

  if (s === 'M' || s === 'MALE') return 'M';
  if (s === 'F' || s === 'FEMALE') return 'F';
  if (s === 'O' || s === 'OTHER') return 'O';
  if (s === 'U' || s === 'UNKNOWN') return 'U';

  if (s === 'M' || s === 'F' || s === 'O' || s === 'U') return s as PatientSex;

  return undefined;
}

export default function VisitCheckoutBillingPage() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();
  const auth = useAuth();
  const role = auth.status === 'authenticated' ? auth.role : undefined;
  const isAdmin = role === 'ADMIN';

  const visitId = String(params?.visitId ?? '');

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const visit: unknown = visitQuery.data;

  // ✅ bill existence signal from visit meta (no 404 spam)
  const billExists =
    getBool(visit, 'checkedOut') === true ||
    getNum(visit, 'billingAmount') !== undefined ||
    getNum(visit, 'billingAmount') === 0;

  const isOfflineVisit = getBool(visit, 'isOffline') === true;

  // ✅ fetch bill only when it exists + admin (admin edits)
  const shouldFetchBill = !!visitId && !!visit && billExists && isAdmin;

  const patientId = getStr(visit, 'patientId');
  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !patientId });

  const billQuery = useGetVisitBillQuery({ visitId }, { skip: !shouldFetchBill });
  const bill: unknown = billQuery.data ?? null;

  const billNotFound = !billExists;

  React.useEffect(() => {
    if (!visitId) return;
    if (!visit) return;
    if (!isAdmin && billExists) {
      router.replace(`/visits/${visitId}/checkout/printing`);
    }
  }, [visitId, visit, isAdmin, billExists, router]);

  const isZeroBilled = getBool(visit, 'zeroBilled') === true;
  const [billingEnabledForZero, setBillingEnabledForZero] = React.useState(false);

  const [updateVisitBill, updateBillState] = useUpdateVisitBillMutation();

  React.useEffect(() => {
    setBillingEnabledForZero(false);
  }, [visitId]);

  const status = getStr(visit, 'status');
  const canCheckout = !!visitId && !!visit && (status === 'DONE' || isOfflineVisit);

  const [checkoutVisit, checkoutState] = useCheckoutVisitMutation();
  const [updateVisitStatus, updateVisitStatusState] = useUpdateVisitStatusMutation();

  const [lines, setLines] = React.useState<LineDraft[]>([]);
  const [discountAmount, setDiscountAmount] = React.useState(0);
  const [taxAmount, setTaxAmount] = React.useState(0);

  const [serviceDraft, setServiceDraft] = React.useState('');
  const [qtyDraft, setQtyDraft] = React.useState('1');
  const [amountDraft, setAmountDraft] = React.useState('');

  const [editIndex, setEditIndex] = React.useState<number | null>(null);
  const [editService, setEditService] = React.useState('');
  const [editQty, setEditQty] = React.useState('1');
  const [editAmount, setEditAmount] = React.useState('');

  const [receivedOnline, setReceivedOnline] = React.useState(false);
  const [receivedOffline, setReceivedOffline] = React.useState(false);

  const hydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (!bill) return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const items = getBillItems(bill);

    setLines(
      items.map((it) => ({
        description: typeof it.description === 'string' ? it.description : '',
        quantity: intQty(it.quantity ?? 1),
        unitAmount: money(it.unitAmount),
      })),
    );

    setDiscountAmount(money(isRecord(bill) ? (bill as BillLike).discountAmount : 0));
    setTaxAmount(money(isRecord(bill) ? (bill as BillLike).taxAmount : 0));

    const ro = isRecord(bill) ? (bill as BillLike).receivedOnline : undefined;
    const rf = isRecord(bill) ? (bill as BillLike).receivedOffline : undefined;

    setReceivedOnline(ro === true);
    setReceivedOffline(rf === true);
  }, [bill]);

  const billingMuted = isZeroBilled && !billingEnabledForZero;

  const computed = React.useMemo(() => {
    if (billingMuted) {
      return { subtotal: 0, discount: 0, tax: 0, total: 0, safeLines: [] as LineDraft[] };
    }

    const safeLines = lines
      .map((l) => ({
        description: (l.description ?? '').trim(),
        quantity: intQty(l.quantity ?? 1),
        unitAmount: Math.max(0, money(l.unitAmount)),
      }))
      .filter((l) => l.description.length > 0);

    const subtotal = safeLines.reduce((sum, l) => sum + l.quantity * l.unitAmount, 0);
    const discount = Math.max(0, money(discountAmount));
    const tax = Math.max(0, money(taxAmount));
    const total = Math.max(0, subtotal - Math.min(discount, subtotal) + tax);

    return { subtotal, discount, tax, total, safeLines };
  }, [lines, discountAmount, taxAmount, billingMuted]);

  const patientName = patientQuery.data?.name;
  const patientPhone = patientQuery.data?.phone;

  // ---- Visit summary fields (replaces Doctor card) ----
  const visitRec: UnknownRecord = isRecord(visit) ? (visit as UnknownRecord) : {};
  const patientRec: UnknownRecord = isRecord(patientQuery.data)
    ? (patientQuery.data as UnknownRecord)
    : {};

  const patientSdId = getStr(patientRec, 'sdId') ?? getStr(visitRec, 'sdId') ?? undefined;

  const opdNo =
    getStr(visitRec, 'opdNo') ??
    getStr(visitRec, 'opdId') ??
    getStr(visitRec, 'opdNumber') ??
    undefined;

  const patientDobRaw =
    (patientRec as any).dob ??
    (patientRec as any).dateOfBirth ??
    (patientRec as any).birthDate ??
    (patientRec as any).dobIso ??
    null;

  const patientSexRaw =
    (patientRec as any).sex ?? (patientRec as any).gender ?? (patientRec as any).patientSex ?? null;

  const patientDob = safeParseDobToDate(patientDobRaw);
  const visitCreatedAtMs = getNum(visitRec, 'createdAt') ?? Date.now();

  const patientAge = patientDob ? calculateAge(patientDob, new Date(visitCreatedAtMs)) : undefined;
  const patientSex = normalizeSex(patientSexRaw);
  const ageSexLabel = patientAge !== undefined ? `${patientAge} / ${patientSex ?? '—'}` : '—';

  const checkedOut = getBool(visitRec, 'checkedOut') === true;

  const visitCreatedDateLabel = visitCreatedAtMs
    ? `Visit: ${toLocalISODate(new Date(visitCreatedAtMs))}`
    : undefined;

  const visitDateLabel = getStr(visitRec, 'visitDate')
    ? `Visit: ${String((visitRec as any).visitDate)}`
    : undefined;

  const visitDateDisplay =
    visitDateLabel?.replace('Visit:', '').trim() ||
    visitCreatedDateLabel?.replace('Visit:', '').trim() ||
    '—';

  // ---- Refs / inputs ----
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

  const addLineFromDraft = () => {
    if (billingMuted) return;

    const desc = serviceDraft.trim();
    const qty = intQty(qtyDraft);
    const amt = Math.max(0, money(amountDraft));

    if (!desc) {
      toast.info('Enter a service name.');
      serviceRef.current?.focus();
      return;
    }

    if (!Number.isFinite(qty) || qty < 1) {
      toast.info('Quantity must be at least 1.');
      qtyRef.current?.focus();
      return;
    }

    setLines((prev) => [...prev, { description: desc, quantity: qty, unitAmount: amt }]);
    setServiceDraft('');
    setQtyDraft('1');
    setAmountDraft('');
    requestAnimationFrame(() => serviceRef.current?.focus());
  };

  const startEdit = (idx: number) => {
    if (billingMuted) return;
    const row = lines[idx];
    setEditIndex(idx);
    setEditService(row?.description ?? '');
    setEditQty(String(intQty(row?.quantity ?? 1)));
    setEditAmount(String(row?.unitAmount ?? 0));
    requestAnimationFrame(() => editServiceRef.current?.focus());
  };

  const commitEdit = () => {
    if (editIndex === null) return;

    const desc = editService.trim();
    const qty = intQty(editQty);
    const amt = Math.max(0, money(editAmount));

    if (!desc) {
      toast.info('Service name cannot be empty.');
      editServiceRef.current?.focus();
      return;
    }

    if (!Number.isFinite(qty) || qty < 1) {
      toast.info('Quantity must be at least 1.');
      editQtyRef.current?.focus();
      return;
    }

    setLines((prev) =>
      prev.map((x, i) =>
        i === editIndex ? { description: desc, quantity: qty, unitAmount: amt } : x,
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
    if (billingMuted) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
    requestAnimationFrame(() => serviceRef.current?.focus());
  };

  const onEnableBilling = () => {
    setBillingEnabledForZero(true);
    toast.info('Billing enabled for this zero-billed visit.');
    requestAnimationFrame(() => serviceRef.current?.focus());
  };

  const onSave = async () => {
    if (!visit) return;

    const currentStatus = getStr(visit, 'status');

    if (isOfflineVisit && currentStatus !== 'DONE') {
      try {
        await updateVisitStatus({ visitId, status: 'DONE' }).unwrap();
        await visitQuery.refetch();
      } catch (err: unknown) {
        const e = err as ApiError;
        const msg =
          getStr(e.data, 'message') || getErrorMessage(err) || 'Failed to mark visit DONE.';
        toast.error(msg);
        return;
      }
    }

    if (!isOfflineVisit && currentStatus !== 'DONE') {
      toast.error('Checkout is only allowed when visit is DONE.');
      return;
    }

    const payload: BillingCheckoutInput = billingMuted
      ? {
          items: [{ description: 'Zero billed', quantity: 1, unitAmount: 0 }],
          discountAmount: 0,
          taxAmount: 0,
          allowZeroBilled: true,
          receivedOnline,
          receivedOffline,
        }
      : {
          items: computed.safeLines.length
            ? computed.safeLines.map((l) => ({
                description: l.description,
                quantity: intQty(l.quantity),
                unitAmount: l.unitAmount,
              }))
            : [
                {
                  description: isOfflineVisit ? 'Offline Rx' : 'Consultation',
                  quantity: 1,
                  unitAmount: 0,
                },
              ],
          discountAmount: computed.discount,
          taxAmount: computed.tax,
          ...(isZeroBilled ? { allowZeroBilled: true } : {}),
          receivedOnline,
          receivedOffline,
        };

    try {
      if (billExists) {
        await updateVisitBill({ visitId, input: payload }).unwrap(); // ✅ PATCH
        toast.success('Bill updated.');
      } else {
        await checkoutVisit({ visitId, input: payload }).unwrap(); // ✅ POST
        toast.success('Checkout saved.');
      }

      router.replace(`/visits/${visitId}/checkout/printing`);
    } catch (err: unknown) {
      const e = err as ApiError;
      const code = getStr(e.data, 'error');
      const msg = getStr(e.data, 'message') || getErrorMessage(err) || 'Checkout failed.';

      if (code === 'VISIT_NOT_DONE') toast.error('Visit must be DONE before checkout.');
      else if (code === 'DUPLICATE_CHECKOUT') toast.error('This visit is already checked out.');
      else toast.error(msg);
    }
  };

  if (bill && !isAdmin) return <div className="p-6 text-sm text-gray-600">Redirecting…</div>;

  const saveDisabled =
    !canCheckout ||
    checkoutState.isLoading ||
    updateBillState.isLoading ||
    updateVisitStatusState.isLoading;

  return (
    <section className="p-4 2xl:p-8">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold text-gray-900">
            {bill ? 'Edit Bill' : 'Billing'}
          </div>
          <div className="text-xs text-gray-500">
            Tag: {getStr(visit, 'tag') ?? '—'} · Zero billed: {isZeroBilled ? 'Yes' : 'No'} ·
            Status: {getStr(visit, 'status') ?? '—'}
            {isOfflineVisit ? ' · Offline: Yes' : ''}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl cursor-pointer"
            onClick={() => router.back()}
          >
            Back
          </Button>

          <Button
            type="button"
            variant="default"
            className="rounded-xl bg-black text-white hover:bg-black/90 cursor-pointer"
            onClick={() => void onSave()}
            disabled={saveDisabled}
          >
            {checkoutState.isLoading ||
            updateBillState.isLoading ||
            updateVisitStatusState.isLoading
              ? 'Saving…'
              : bill
                ? 'Save changes'
                : 'Save'}
          </Button>
        </div>
      </div>

      {isZeroBilled ? (
        <Card className="mb-4 rounded-2xl border bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-gray-700">
              <div className="font-semibold text-gray-900">Zero-billed (Z) visit</div>
              <div className="mt-1 text-xs text-gray-600">
                Billing is <span className="font-semibold">disabled by default</span>. Click “Save”
                to continue with a ₹0 bill. If you want to add charges, click “Enable billing”.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={onEnableBilling}
                disabled={billingEnabledForZero}
              >
                {billingEnabledForZero ? 'Billing enabled' : 'Enable billing'}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* ✅ Top cards: Patient + Visit summary + Bill status */}
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-gray-500">Patient</div>
          <div className="mt-1 text-base font-semibold text-gray-900">{patientName ?? '—'}</div>
          <div className="mt-1 text-sm text-gray-600">{patientPhone ?? '—'}</div>
        </Card>

        <Card className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-gray-500">Visit summary</div>

          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div className="text-gray-500">Visit date</div>
            <div className="text-right font-medium text-gray-900">{visitDateDisplay}</div>

            <div className="text-gray-500">SD ID</div>
            <div className="text-right font-medium text-gray-900">{patientSdId ?? '—'}</div>

            <div className="text-gray-500">OPD No</div>
            <div className="text-right font-medium text-gray-900">{opdNo ?? '—'}</div>

            <div className="text-gray-500">Age / Sex</div>
            <div className="text-right font-medium text-gray-900">{ageSexLabel}</div>

            <div className="text-gray-500">Checked out</div>
            <div className="text-right font-medium text-gray-900">{checkedOut ? 'Yes' : 'No'}</div>
          </div>
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

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  checked={receivedOnline}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setReceivedOnline(next);
                    if (next) setReceivedOffline(false);
                  }}
                />
                Received online
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  checked={receivedOffline}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setReceivedOffline(next);
                    if (next) setReceivedOnline(false);
                  }}
                />
                Received offline
              </label>

              {receivedOnline && receivedOffline ? (
                <span className="text-xs text-red-600">Choose only one</span>
              ) : null}
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
                placeholder="1"
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
                className="w-11 rounded-xl bg-black p-0 text-white hover:bg-black/90 cursor-pointer"
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
              No services added yet. Add a service, qty and amount above.
            </div>
          ) : (
            lines.map((l, idx) => {
              const isEditing = editIndex === idx;
              const q = intQty(l.quantity);
              const ua = money(l.unitAmount);
              const lineTotal = q * ua;

              return (
                <div key={`${idx}-${l.description}`} className="rounded-2xl border bg-white p-4">
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
                          disabled={billingMuted}
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
                          disabled={billingMuted}
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
                          disabled={billingMuted}
                        />
                      </div>

                      <div className="col-span-12 md:col-span-2 flex justify-start gap-2">
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
                        <div className="text-xs text-gray-500">
                          Qty {q} × {ua.toFixed(2)}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="tabular-nums text-base font-bold text-gray-900">
                          {lineTotal.toFixed(2)}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                            onClick={() => startEdit(idx)}
                            disabled={billingMuted}
                            title="Edit"
                          >
                            <IconPen className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
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
          Tip: Enter → Qty, Enter → Amount, Enter → Add, Enter → Next service.
        </div>
      </Card>
    </section>
  );
}
