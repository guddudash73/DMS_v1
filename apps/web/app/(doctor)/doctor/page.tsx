'use client';

import * as React from 'react';

import DoctorQueueCard from '@/components/doctor/dashboard/DoctorQueueCard';
import QueueSummaryCard from '@/components/doctor/dashboard/QueueSummaryCard';
import DoctorPatientsChart from '@/components/doctor/dashboard/DoctorPatientsChart';
import DoctorDailyVisitsBreakdownPanel from '@/components/doctor/dashboard/DoctorDailyVisitsBreakdownPanel';

export default function DoctorDashboardPage() {
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  // DETAIL MODE (after click on a chart point) — FULL CONTENT AREA like clinic page
  if (selectedDate) {
    return (
      <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
        <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col gap-6 2xl:gap-10">
          {/* Chart stays on top */}
          <DoctorPatientsChart onDateSelect={(dateIso) => setSelectedDate(dateIso)} />

          {/* Breakdown goes UNDER the chart, wider */}
          <DoctorDailyVisitsBreakdownPanel
            date={selectedDate}
            onBack={() => setSelectedDate(null)}
          />
        </div>
      </section>
    );
  }

  // NORMAL DOCTOR DASHBOARD MODE (your existing layout)
  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="grid h-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,3fr)]">
        {/* Left column */}
        <div className="flex flex-col gap-6 2xl:gap-10">
          <DoctorQueueCard />
          <QueueSummaryCard />
        </div>

        {/* Right column */}
        <div className="flex h-full flex-col gap-6 2xl:gap-10">
          <DoctorPatientsChart onDateSelect={(dateIso) => setSelectedDate(dateIso)} />

          <div className="flex h-full items-center justify-center rounded-2xl bg-white shadow-sm">
            <div className="text-center text-sm text-gray-500">
              Click a date on the chart to view daily breakdown.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
