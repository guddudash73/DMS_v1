'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import type { Billing } from '@dcm/types';

type Props = {
  open?: boolean;
  billing: Billing | null | undefined;
  patientName?: string;
  patientPhone?: string;
  doctorName?: string;
  visitId?: string;
  visitDateLabel?: string;
  onAfterPrint?: () => void;
};

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

export function BillPrintSheet(props: Props) {
  const {
    open = false,
    billing,
    patientName,
    patientPhone,
    doctorName,
    visitId,
    visitDateLabel,
    onAfterPrint,
  } = props;

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const currency = billing?.currency ?? 'INR';

  const createdAtLabel = React.useMemo(() => {
    const ts = billing?.createdAt;
    if (!ts) return '—';

    try {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(ts));
    } catch {
      return '—';
    }
  }, [billing?.createdAt]);

  React.useEffect(() => {
    if (!mounted) return;
    if (!open) return;
    if (!billing) return;

    const onAfter = () => {
      document.body.classList.remove('print-bill');
      window.removeEventListener('afterprint', onAfter);
      onAfterPrint?.();
    };

    window.addEventListener('afterprint', onAfter);
    document.body.classList.add('print-bill');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });

    return () => {
      window.removeEventListener('afterprint', onAfter);
      document.body.classList.remove('print-bill');
    };
  }, [mounted, open, billing, onAfterPrint]);

  if (!mounted) return null;

  return createPortal(
    <div className={`bill-print-root ${open ? '' : 'hidden'}`}>
      <style>{`
        .bill-print-root { display: none; }

        @media print {
          body.print-bill > *:not(.bill-print-root) { display: none !important; }
          body.print-bill .bill-print-root { display: block !important; }

          @page { size: A4; margin: 0; }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .bill-a4 {
            width: 210mm;
            height: 297mm;
            margin: 0 auto;
            padding: 10mm;
            box-sizing: border-box;
            background: white;
          }
        }
      `}</style>

      <div className="bill-a4 text-black">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12">
                <Image
                  src="/sarangi-logo.png"
                  alt="Sarangi Dentistry"
                  fill
                  className="object-contain"
                  priority
                  unoptimized
                />
              </div>
              <div>
                <div className="text-[16px] font-semibold text-gray-900">Sarangi Dentistry</div>
                <div className="text-[11px] text-gray-600">Receipt / Bill</div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-gray-600">Created</div>
              <div className="text-[12px] font-medium text-gray-900">{createdAtLabel}</div>
              <div className="mt-2 text-[11px] text-gray-600">Visit ID</div>
              <div className="text-[12px] font-medium text-gray-900">{visitId ?? '—'}</div>
            </div>
          </div>

          <div className="mt-3 h-px w-full bg-gray-900/10" />

          {/* Patient/doctor */}
          <div className="mt-3 grid grid-cols-2 gap-6 text-[12px]">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-gray-700">Patient</div>
              <div className="text-gray-900">
                <span className="text-gray-600">Name:</span>{' '}
                <span className="font-medium">{patientName ?? '—'}</span>
              </div>
              <div className="text-gray-900">
                <span className="text-gray-600">Phone:</span>{' '}
                <span className="font-medium">{patientPhone ?? '—'}</span>
              </div>
            </div>

            <div className="space-y-1 text-right">
              <div className="text-[11px] font-semibold text-gray-700">Clinician</div>
              <div className="text-gray-900">
                <span className="font-medium">{doctorName ?? '—'}</span>
              </div>
              <div className="text-gray-900">
                <span className="text-gray-600">Date:</span>{' '}
                <span className="font-medium">
                  {visitDateLabel?.replace('Visit:', '').trim() || '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 h-px w-full bg-gray-900/10" />

          {/* Items */}
          <div className="mt-4 min-h-0 flex-1">
            {!billing ? (
              <div className="rounded-xl border bg-white p-4 text-sm text-gray-700">
                No billing data.
              </div>
            ) : (
              <div className="rounded-xl border border-gray-900/10">
                <div className="grid grid-cols-12 gap-2 border-b border-gray-900/10 bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-700">
                  <div className="col-span-8">Description</div>
                  <div className="col-span-4 text-right">Amount</div>
                </div>

                <div className="px-3 py-2 text-[12px]">
                  {billing.items.map((it, idx) => (
                    <div
                      key={`${it.description}-${idx}`}
                      className="grid grid-cols-12 gap-2 border-b border-gray-900/5 py-2 last:border-b-0"
                    >
                      <div className="col-span-8 text-gray-900">
                        <div className="font-medium">{it.description}</div>
                        {it.code ? (
                          <div className="text-[11px] text-gray-500">{it.code}</div>
                        ) : null}
                      </div>
                      <div className="col-span-4 text-right font-medium text-gray-900">
                        {formatMoney(it.lineTotal, currency)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Totals */}
          {billing ? (
            <div className="mt-4 rounded-xl border border-gray-900/10 bg-gray-50 p-3 text-[12px]">
              <div className="flex items-center justify-between">
                <div className="text-gray-600">Subtotal</div>
                <div className="font-medium text-gray-900">
                  {formatMoney(billing.subtotal, currency)}
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="text-gray-600">Discount</div>
                <div className="font-medium text-gray-900">
                  {formatMoney(billing.discountAmount, currency)}
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="text-gray-600">Tax</div>
                <div className="font-medium text-gray-900">
                  {formatMoney(billing.taxAmount, currency)}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-gray-900/10 pt-2">
                <div className="text-[13px] font-semibold text-gray-900">Total</div>
                <div className="text-[13px] font-semibold text-gray-900">
                  {formatMoney(billing.total, currency)}
                </div>
              </div>
            </div>
          ) : null}

          {/* Footer */}
          <div className="mt-4 text-[10px] text-gray-600">
            <div className="h-px w-full bg-gray-900/10" />
            <div className="mt-2 flex items-center justify-between">
              <div>Thank you.</div>
              <div>Generated by Sarangi DMS</div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
