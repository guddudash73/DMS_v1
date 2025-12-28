'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Users, UserCog, Pill, FileText, ArrowRight, ShieldCheck } from 'lucide-react';

import {
  useGetDoctorsQuery,
  useAdminListMedicinesQuery,
  useAdminListRxPresetsQuery,
} from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';

function StatCard({
  title,
  value,
  hint,
  icon,
  loading,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className="rounded-2xl border bg-white p-5 shadow-none">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold tracking-wide text-gray-500">{title}</div>

          <div className="mt-2 text-2xl font-semibold text-gray-900">
            {loading ? <span className="text-gray-300">…</span> : value}
          </div>

          <div className="mt-1 text-[11px] text-gray-500">{hint}</div>
        </div>

        <div className="rounded-2xl border bg-gray-50 p-2 text-gray-700">{icon}</div>
      </div>
    </Card>
  );
}

function QuickLink({
  title,
  desc,
  href,
  icon,
}: {
  title: string;
  desc: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="block">
      <Card className="group rounded-2xl border bg-white p-5 shadow-none transition hover:bg-gray-50">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border bg-gray-50 p-2 text-gray-700">{icon}</div>

          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">{title}</div>
              <ArrowRight className="h-4 w-4 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-gray-700" />
            </div>
            <div className="mt-1 text-[11px] text-gray-500">{desc}</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const doctorsQuery = useGetDoctorsQuery(undefined, { skip: !canUseApi });

  // ✅ Use admin list endpoints to get TOTAL accurately (limit 1 to keep payload tiny)
  const medicinesQuery = useAdminListMedicinesQuery({ query: '', limit: 1 }, { skip: !canUseApi });
  const rxPresetsQuery = useAdminListRxPresetsQuery({ query: '', limit: 1 }, { skip: !canUseApi });

  const doctorsCount = doctorsQuery.data?.length != null ? String(doctorsQuery.data.length) : '—';
  const medicinesCount =
    medicinesQuery.data?.total != null ? String(medicinesQuery.data.total) : '—';
  const rxPresetsCount =
    rxPresetsQuery.data?.total != null ? String(rxPresetsQuery.data.total) : '—';

  return (
    <div className="p-4 2xl:p-12">
      <div className="mb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-gray-900">
          <ShieldCheck className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Clinic Admin</h2>
        </div>

        <p className="text-sm text-gray-600">
          Manage doctors, medicine presets, prescription templates, and system settings.
        </p>

        {!canUseApi && (
          <div className="mt-2 rounded-2xl border bg-white px-4 py-2 text-xs text-gray-600">
            Please log in to load live stats.
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Doctors"
          value={doctorsCount}
          hint="Manage doctor accounts & profiles"
          icon={<UserCog className="h-5 w-5" />}
          loading={canUseApi && doctorsQuery.isLoading}
        />

        <StatCard
          title="Medicines"
          value={medicinesCount}
          hint="Verified + inline-added presets"
          icon={<Pill className="h-5 w-5" />}
          loading={canUseApi && medicinesQuery.isLoading}
        />

        <StatCard
          title="Rx Presets"
          value={rxPresetsCount}
          hint="Prescription templates for doctors"
          icon={<FileText className="h-5 w-5" />}
          loading={canUseApi && rxPresetsQuery.isLoading}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <QuickLink
          title="Doctors"
          desc="Add/edit doctors, active status, profile metadata"
          href="/admin/doctors"
          icon={<UserCog className="h-5 w-5" />}
        />
        <QuickLink
          title="Medicines"
          desc="Search presets, verify inline additions, merge duplicates"
          href="/admin/medicines"
          icon={<Pill className="h-5 w-5" />}
        />
        <QuickLink
          title="Rx Presets"
          desc="Create & manage multi-line prescription templates"
          href="/admin/rx-presets"
          icon={<FileText className="h-5 w-5" />}
        />
        <QuickLink
          title="Users & Roles"
          desc="Manage user accounts and access roles (if enabled)"
          href="/admin/users"
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      <div className="mt-8 text-[11px] text-gray-500">
        Tip: keep the catalog clean—verified medicines reduce doctor typing and prevent duplicates.
      </div>
    </div>
  );
}
