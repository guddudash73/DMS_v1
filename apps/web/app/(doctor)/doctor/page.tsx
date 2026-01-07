// apps/web/app/(doctor)/doctor/page.tsx
'use client';

import * as React from 'react';

import DoctorQueueCard from '@/components/doctor/dashboard/DoctorQueueCard';
import QueueSummaryCard from '@/components/doctor/dashboard/QueueSummaryCard';
import TodayCaseMixCard from '@/components/doctor/dashboard/TodayCaseMixCard';
import RecentlyCompletedCard from '@/components/doctor/dashboard/RecentlyCompletedCard';
import DoctorQueueFullPanel from '@/components/doctor/dashboard/DoctorQueueFullPanel';

type ViewMode = 'dashboard' | 'queue';

export default function DoctorDashboardPage() {
  const [viewMode, setViewMode] = React.useState<ViewMode>('dashboard');

  if (viewMode === 'queue') {
    return <DoctorQueueFullPanel onBack={() => setViewMode('dashboard')} />;
  }

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="grid h-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.9fr)]">
        {/* LEFT (wide) — operational cards */}
        <div className="flex h-full flex-col gap-6 2xl:gap-10">
          <DoctorQueueCard onViewAll={() => setViewMode('queue')} />
          <RecentlyCompletedCard />
        </div>

        {/* RIGHT (narrow) — summary cards */}
        <div className="flex flex-col gap-6 2xl:gap-10">
          <TodayCaseMixCard />
          <QueueSummaryCard />
        </div>
      </div>
    </section>
  );
}
