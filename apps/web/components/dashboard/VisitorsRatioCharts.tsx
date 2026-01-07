'use client';

import VisitorsRatioChart from '@/components/dashboard/VisitorsRatioChart';

export type VisitorsRatioChartProps = {
  onDateSelect?: (dateIso: string) => void;
};

export default function VisitorsRatioCharts(props: VisitorsRatioChartProps) {
  return <VisitorsRatioChart {...props} title="Visitors - Ratio" />;
}
