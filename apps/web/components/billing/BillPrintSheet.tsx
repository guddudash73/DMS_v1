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
  ageSexLabel?: string;
  opdNo?: string;
  sdId?: string;
  visitDateLabel?: string;
  onAfterPrint?: () => void;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function getNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

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

function getBillingItems(billing: Billing): Billing['items'] {
  const unknownBilling: unknown = billing;
  if (!isRecord(unknownBilling)) return [];
  const raw = unknownBilling.items;
  return Array.isArray(raw) ? (raw as Billing['items']) : [];
}

function stripVisitPrefix(label?: string) {
  if (!label) return '—';
  return label.replace('Visit:', '').trim() || '—';
}

function toUpperWords(s: string) {
  return s.replace(/\s+/g, ' ').trim().toUpperCase();
}

function numberToIndianWords(n: number): string {
  const num = Math.floor(Math.abs(n));
  if (num === 0) return 'ZERO ONLY';

  const ones = [
    '',
    'ONE',
    'TWO',
    'THREE',
    'FOUR',
    'FIVE',
    'SIX',
    'SEVEN',
    'EIGHT',
    'NINE',
    'TEN',
    'ELEVEN',
    'TWELVE',
    'THIRTEEN',
    'FOURTEEN',
    'FIFTEEN',
    'SIXTEEN',
    'SEVENTEEN',
    'EIGHTEEN',
    'NINETEEN',
  ];
  const tens = [
    '',
    '',
    'TWENTY',
    'THIRTY',
    'FORTY',
    'FIFTY',
    'SIXTY',
    'SEVENTY',
    'EIGHTY',
    'NINETY',
  ];

  const twoDigits = (x: number) => {
    if (x < 20) return ones[x];
    const t = Math.floor(x / 10);
    const o = x % 10;
    return `${tens[t]}${o ? ` ${ones[o]}` : ''}`.trim();
  };

  const threeDigits = (x: number) => {
    const h = Math.floor(x / 100);
    const r = x % 100;
    const head = h ? `${ones[h]} HUNDRED` : '';
    const tail = r ? `${twoDigits(r)}` : '';
    return `${head}${head && tail ? ' ' : ''}${tail}`.trim();
  };

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rem = num % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} CRORE`);
  if (lakh) parts.push(`${threeDigits(lakh)} LAKH`);
  if (thousand) parts.push(`${threeDigits(thousand)} THOUSAND`);
  if (rem) parts.push(threeDigits(rem));

  return `${parts.join(' ').replace(/\s+/g, ' ').trim()} ONLY`;
}

export function BillPrintSheet(props: Props) {
  const {
    open = false,
    billing,
    patientName,
    patientPhone,
    ageSexLabel,
    opdNo,
    sdId,
    visitDateLabel,
    onAfterPrint,
  } = props;

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const currency = billing?.currency ?? 'INR';
  const billNo = billing?.billNo ?? '—';

  const createdAtLabel = React.useMemo(() => {
    const ts = billing?.createdAt;
    if (!ts) return '—';
    try {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(ts));
    } catch {
      return '—';
    }
  }, [billing]);

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

  const items = billing ? getBillingItems(billing) : [];

  const total = billing?.total ?? 0;
  const amountInWords = numberToIndianWords(total);

  const ageSex = ageSexLabel ?? '—';
  const opdLabel = opdNo ?? '—';
  const sdLabel = sdId ?? '—';

  const dateLabel =
    stripVisitPrefix(visitDateLabel) !== '—' ? stripVisitPrefix(visitDateLabel) : createdAtLabel;

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
            background: #fff;
            color: #0b0b0b;
            font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
          }

          .muted { color: rgba(0,0,0,0.62); }
          .hairline { height: 0.6pt; background: rgba(0,0,0,0.18); width: 100%; }

          .header-doctors { display:flex; align-items:center; justify-content:center; gap: 30px; }
          .doc-name { font-size: 14px; font-weight: 900; line-height: 1.05; white-space: nowrap; }
          .doc-sub { font-size: 10.5px; font-weight: 800; line-height: 1.05; color: rgba(0,0,0,0.62); white-space: nowrap; }
          .clinic-line { margin-top: 4px; font-size: 10px; font-weight: 700; letter-spacing: .04em; color: rgba(0,0,0,0.55); }

          .meta { border: 0.6pt solid rgba(0,0,0,0.24); border-radius: 2.2mm; overflow:hidden; }
          .meta-grid { display:grid; grid-template-columns: 1fr 1fr; }
          .meta-cell { padding: 6px 10px; border-bottom: 0.6pt solid rgba(0,0,0,0.14); }
          .meta-cell:nth-child(odd) { border-right: 0.6pt solid rgba(0,0,0,0.14); }
          .meta-cell.last-row { border-bottom: 0; }

          .meta-line { display:flex; align-items: baseline; gap: 8px; min-width: 0; font-size: 12px; line-height: 1.15; }
          .meta-label { font-weight: 900; color: rgba(0,0,0,0.65); white-space: nowrap; }
          .meta-sep { font-weight: 900; color: rgba(0,0,0,0.45); margin-left: -2px; }
          .meta-value { font-weight: 800; color: rgba(0,0,0,0.90); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

          .meta-trip {
            display: grid;
            grid-template-columns: 1.2fr 0.9fr 0.9fr;
            gap: 0;
          }
          .meta-trip > div {
            padding: 6px 10px;
            border-right: 0.6pt solid rgba(0,0,0,0.14);
          }
          .meta-trip > div:last-child { border-right: 0; }

          .tbl { width:100%; border-collapse: collapse; border: 0.6pt solid rgba(0,0,0,0.24); border-radius: 2.2mm; overflow:hidden; }
          .tbl th, .tbl td { border-bottom: 0.6pt solid rgba(0,0,0,0.12); padding: 6px 10px; font-size: 12px; line-height: 1.15; }
          .tbl thead th { background: rgba(0,0,0,0.03); font-weight: 950; border-bottom: 0.6pt solid rgba(0,0,0,0.20); }
          .tbl td + td, .tbl th + th { border-left: 0.6pt solid rgba(0,0,0,0.12); }
          .tbl tbody tr:last-child td { border-bottom: 0; }

          .totals { width: 290px; border: 0.6pt solid rgba(0,0,0,0.24); border-radius: 2.2mm; overflow:hidden; }
          .totals-row { display:grid; grid-template-columns: 1fr auto; gap: 12px; padding: 9px 12px; font-size: 12px; }
          .totals-row .label { font-weight: 950; color: rgba(0,0,0,0.60); }
          .totals-row .value { font-weight: 950; color: rgba(0,0,0,0.92); font-variant-numeric: tabular-nums; }

          .sig-line { display:inline-block; width: 175px; height: 0.6pt; background: rgba(0,0,0,0.35); margin-top: 16px; }
          .footer { font-size: 10px; color: rgba(0,0,0,0.52); text-align:center; }
        }
      `}</style>

      <div className="bill-a4">
        <div className="flex h-full flex-col">
          <div className="w-full">
            <div className="flex items-start justify-between">
              <div className="flex w-[28%] items-start">
                <div className="relative h-13.5 w-13.5">
                  <Image
                    src="/rx-logo-r.png"
                    alt="Clinic logo"
                    fill
                    className="object-contain"
                    priority
                    unoptimized
                  />
                </div>
              </div>

              <div className="w-[60%] text-center pt-4">
                <div className="header-doctors">
                  <div>
                    <div className="doc-name">Dr. Soumendra Sarangi</div>
                    <div className="doc-sub">B.D.S. Redg. - 68</div>
                  </div>

                  <div>
                    <div className="doc-name">Dr. Vaishnovee Sarangi</div>
                    <div className="doc-sub">B.D.S. Redg. - 3057</div>
                  </div>
                </div>

                <div className="clinic-line">A-33, STALWART COMPLEX, UNIT - IV, BHUBANESWAR</div>
              </div>

              <div className="w-[28%]">
                <div className="flex justify-end">
                  <div className="relative h-13.5 w-41">
                    <Image
                      src="/dashboard-logo.png"
                      alt="Sarangi Dentistry"
                      fill
                      className="object-contain"
                      priority
                      unoptimized
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="hairline mt-5" />
          </div>

          <div className="mt-3 flex items-center justify-center gap-3">
            <div className="hairline" style={{ maxWidth: '92px' }} />
            <div className="text-center text-[12px] font-extrabold tracking-[0.16em]">
              MONEY RECEIPT
            </div>
            <div className="hairline" style={{ maxWidth: '92px' }} />
          </div>

          <div className="mt-3 meta">
            <div className="meta-grid">
              <div className="meta-cell">
                <div className="meta-line">
                  <span className="meta-label">Patient Name</span>
                  <span className="meta-sep">:</span>
                  <span className="meta-value">{patientName ?? '—'}</span>
                </div>
              </div>

              <div className="meta-cell">
                <div className="meta-line">
                  <span className="meta-label">Age / Sex</span>
                  <span className="meta-sep">:</span>
                  <span className="meta-value">{ageSex}</span>
                </div>
              </div>

              <div className="meta-cell">
                <div className="meta-line">
                  <span className="meta-label">OPD</span>
                  <span className="meta-sep">:</span>
                  <span className="meta-value">{opdLabel}</span>
                </div>
              </div>

              <div className="meta-cell">
                <div className="meta-line">
                  <span className="meta-label">Mob</span>
                  <span className="meta-sep">:</span>
                  <span className="meta-value">{patientPhone ?? '—'}</span>
                </div>
              </div>

              <div className="meta-cell last-row" style={{ gridColumn: '1 / span 2', padding: 0 }}>
                <div className="meta-trip">
                  <div>
                    <div className="meta-line">
                      <span className="meta-label">SD ID</span>
                      <span className="meta-sep">:</span>
                      <span className="meta-value">{sdLabel}</span>
                    </div>
                  </div>

                  <div>
                    <div className="meta-line">
                      <span className="meta-label">Receipt</span>
                      <span className="meta-sep">:</span>
                      <span className="meta-value">{billNo}</span>
                    </div>
                  </div>

                  <div>
                    <div className="meta-line">
                      <span className="meta-label">Date</span>
                      <span className="meta-sep">:</span>
                      <span className="meta-value">{dateLabel}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: '52px', textAlign: 'left' }}>Sl</th>
                  <th style={{ textAlign: 'left' }}>Service Name</th>
                  <th style={{ width: '92px', textAlign: 'right' }}>Price</th>
                  <th style={{ width: '64px', textAlign: 'center' }}>Qty</th>
                  <th style={{ width: '118px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '10px 12px', fontSize: 12 }}>
                      No billing items.
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => {
                    const u: unknown = it as unknown;

                    const qty =
                      isRecord(u) && getNumber(u.quantity) !== null
                        ? Math.max(1, Math.floor(getNumber(u.quantity) ?? 1))
                        : 1;

                    const lineTotal = it.lineTotal ?? 0;

                    const unitPrice =
                      isRecord(u) && getNumber(u.unitPrice) !== null
                        ? (getNumber(u.unitPrice) as number)
                        : qty
                          ? Math.round(lineTotal / qty)
                          : Math.round(lineTotal);

                    return (
                      <tr key={`${it.description}-${idx}`}>
                        <td style={{ textAlign: 'left', fontWeight: 900 }}>{idx + 1}</td>
                        <td style={{ textAlign: 'left', fontWeight: 900 }}>
                          {toUpperWords(it.description || '—')}
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(unitPrice, currency)}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 900 }}>{qty}</td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontWeight: 950,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {formatMoney(lineTotal, currency)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex justify-end">
            <div className="totals">
              <div className="totals-row">
                <div className="label">Total Amount</div>
                <div className="value">{formatMoney(total, currency)}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 text-[11px]">
            <div className="hairline" />
            <div className="mt-2 flex items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold">
                  <span className="muted">Vide Cash / Card</span>
                  <span className="ml-3" style={{ fontWeight: 950 }}>
                    {amountInWords}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className="sig-line" />
                <div className="mt-1 text-[10px] font-semibold muted">Authorized Signature</div>
              </div>
            </div>
          </div>

          <div className="flex-1" />
          <div className="mt-4 footer">Generated by Sarangi DMS</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
