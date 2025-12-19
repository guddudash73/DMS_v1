'use client';

import * as React from 'react';

import DoctorQueueCard from '@/components/dashboard/DoctorQueueCard';
import VisitorsRatioChart from '@/components/dashboard/VisitorsRatioCharts';
import PatientsPanel from '@/components/dashboard/PatientsPanel';
import QueueSummaryCard from '@/components/dashboard/QueueSummaryCard';
import DailyVisitsBreakdownPanel from '@/components/dashboard/DailyVisitsBreakdownPanel';

export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  // DETAIL MODE (after click on a chart point)
  if (selectedDate) {
    return (
      <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
        <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col gap-6 2xl:gap-10">
          {/* Chart stays on top */}
          <VisitorsRatioChart onDateSelect={(dateIso) => setSelectedDate(dateIso)} />

          {/* Breakdown goes UNDER the chart, wider */}
          <DailyVisitsBreakdownPanel date={selectedDate} onBack={() => setSelectedDate(null)} />
        </div>
      </section>
    );
  }

  // NORMAL DASHBOARD MODE
  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="grid h-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(320px,0.9fr)]">
        {/* Left column */}
        <div className="flex h-full flex-col gap-6">
          <div className="grid w-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(0,2fr)]">
            <DoctorQueueCard />
            <VisitorsRatioChart onDateSelect={(dateIso) => setSelectedDate(dateIso)} />
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6 2xl:gap-10">
          <PatientsPanel />
          <QueueSummaryCard />
        </div>
      </div>
    </section>
  );
}
