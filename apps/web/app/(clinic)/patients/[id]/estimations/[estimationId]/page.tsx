// apps/web/app/(clinic)/patients/[id]/estimations/[estimationId]/page.tsx
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  useGetEstimationByIdQuery,
  useGetMeQuery,
  useDeleteEstimationMutation,
  useGetPatientByIdQuery,
} from '@/src/store/api';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Role } from '@dcm/types';

import { EstimationPrintSheet } from '@/components/estimations/EstimationPrintSheet';

/* ------------------ Helpers ------------------ */

type UnknownRecord = Record<string, unknown>;
type PatientSex = 'M' | 'F' | 'O' | 'U';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function canManage(role?: Role) {
  return role === 'DOCTOR' || role === 'ADMIN';
}

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function getString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function getNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function getStrFromRecord(rec: UnknownRecord, key: string): string | undefined {
  return getString(rec[key]);
}

function getNumFromRecord(rec: UnknownRecord, key: string): number | undefined {
  return getNumber(rec[key]);
}

/* ------------------ DOB helpers ------------------ */

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

  if (dob instanceof Date) {
    return Number.isFinite(dob.getTime()) ? dob : null;
  }

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

  return undefined;
}

/* ------------------ Page ------------------ */

export default function ViewEstimationPage() {
  const params = useParams<{ id: string; estimationId: string }>();
  const router = useRouter();

  const patientId = String(params.id);
  const estimationId = String(params.estimationId);

  const me = useGetMeQuery().data ?? null;
  const role = me?.role;

  const { data, isLoading, error } = useGetEstimationByIdQuery({ patientId, estimationId });
  const [deleteEstimation, { isLoading: deleting }] = useDeleteEstimationMutation();

  // Patient details
  const patientQuery = useGetPatientByIdQuery(patientId, { skip: !patientId });
  const patientUnknown: unknown = patientQuery.data;
  const patientRec: UnknownRecord = isRecord(patientUnknown) ? patientUnknown : {};

  const patientName =
    (patientQuery.data as any)?.name ?? getStrFromRecord(patientRec, 'name') ?? '—';
  const patientPhone =
    (patientQuery.data as any)?.phone ?? getStrFromRecord(patientRec, 'phone') ?? '—';

  const patientSdId =
    getStrFromRecord(patientRec, 'sdId') ??
    getStrFromRecord(patientRec, 'sdID') ??
    getStrFromRecord(patientRec, 'sd_id') ??
    undefined;

  const patientDobRaw =
    patientRec.dob ?? patientRec.dateOfBirth ?? patientRec.birthDate ?? patientRec.dobIso ?? null;

  const patientSexRaw = patientRec.sex ?? patientRec.gender ?? patientRec.patientSex ?? null;

  const patientDob = safeParseDobToDate(patientDobRaw);
  const patientSex = normalizeSex(patientSexRaw);

  const atDate = data?.createdAt ? new Date(data.createdAt) : new Date();
  const ageFromDob = patientDob ? calculateAge(patientDob, atDate) : undefined;
  const ageStored = getNumFromRecord(patientRec, 'age');
  const patientAge = ageFromDob ?? ageStored;

  const ageSexLabel =
    patientAge !== undefined
      ? `${patientAge} / ${patientSex ?? '—'}`
      : patientSex
        ? `— / ${patientSex}`
        : '—';

  const [printOpen, setPrintOpen] = React.useState(false);
  const expired = data?.validUntil ? data.validUntil < todayIso() : false;

  return (
    <>
      <section className="h-full w-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Estimation</h1>

            <p className="mt-1 text-sm text-gray-600">
              Patient: <span className="font-semibold text-gray-900">{patientName}</span>
            </p>

            {data ? (
              <p className="mt-0.5 text-sm text-gray-600">
                Estimation ID:{' '}
                <span className="font-semibold text-gray-900">{data.estimationNo}</span>
              </p>
            ) : null}
          </div>

          <div className="flex gap-2">
            {/* ✅ FIXED BACK BUTTON */}
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => router.push(`/patients/${patientId}/estimations`)}
            >
              Back
            </Button>

            {data ? (
              <Button variant="outline" className="rounded-2xl" onClick={() => setPrintOpen(true)}>
                Print
              </Button>
            ) : null}

            {data && canManage(role) ? (
              <>
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() =>
                    router.push(`/patients/${patientId}/estimations/${estimationId}/edit`)
                  }
                >
                  Edit
                </Button>

                <Button
                  variant="outline"
                  className="rounded-2xl"
                  disabled={deleting}
                  onClick={async () => {
                    const ok = window.confirm('Delete this estimation?');
                    if (!ok) return;
                    await deleteEstimation({ patientId, estimationId }).unwrap();
                    router.push(`/patients/${patientId}/estimations`);
                  }}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {/* Body */}
        <div className="mt-6">
          <Card className="rounded-2xl border-none bg-white p-6 shadow-sm">
            {isLoading ? (
              <p className="text-sm text-gray-600">Loading…</p>
            ) : error || !data ? (
              <p className="text-sm text-red-600">Unable to load estimation.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-gray-700">
                    <div>
                      Date:{' '}
                      <span className="font-semibold text-gray-900">
                        {new Date(data.createdAt).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                    <div className="mt-1">
                      Valid Until:{' '}
                      <span className="font-semibold text-gray-900">{data.validUntil ?? '—'}</span>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className={[
                      'rounded-full px-4 py-1 text-xs font-semibold',
                      expired
                        ? 'border-rose-200 bg-rose-100 text-rose-700'
                        : 'border-green-200 bg-green-100 text-green-700',
                    ].join(' ')}
                  >
                    {expired ? 'EXPIRED' : 'ACTIVE'}
                  </Badge>
                </div>

                <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Items
                  </div>

                  <div className="mt-3 space-y-2">
                    {data.items.map((x, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-900">
                            {x.description}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-600">Qty: {x.quantity}</div>
                        </div>

                        <div className="text-sm font-semibold text-gray-900">₹{x.amount}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-end text-sm">
                    <div className="text-gray-600">
                      Total: <span className="font-semibold text-gray-900">₹{data.total}</span>
                    </div>
                  </div>
                </div>

                {data.notes ? (
                  <div className="mt-5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Notes
                    </div>
                    <div className="mt-2 whitespace-pre-line rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-800">
                      {data.notes}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </Card>
        </div>
      </section>

      {/* Print */}
      <EstimationPrintSheet
        open={printOpen}
        estimation={data}
        patientName={patientName}
        patientPhone={patientPhone}
        ageSexLabel={ageSexLabel}
        onAfterPrint={() => setPrintOpen(false)}
      />
    </>
  );
}
