'use client';

import * as React from 'react';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGetDailyPatientSummarySeriesQuery } from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';

type TimeRange = '90d' | '30d' | '7d';

const chartConfig = {
  visitors: {
    label: 'Visitors',
  },
  newPatients: {
    label: 'New',
    color: '#4f8f84',
  },
  followupPatients: {
    label: 'Followup',
    color: '#8abab3',
  },
} satisfies ChartConfig;

function getDateRange(range: TimeRange): { startDate: string; endDate: string } {
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  let days = 90;
  if (range === '30d') days = 30;
  if (range === '7d') days = 7;

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));

  const toIso = (d: Date) => d.toISOString().slice(0, 10);

  return {
    startDate: toIso(start),
    endDate: toIso(end),
  };
}

export default function VisitorsRatioChart() {
  const auth = useAuth();
  const [timeRange, setTimeRange] = React.useState<TimeRange>('90d');

  const { startDate, endDate } = React.useMemo(() => getDateRange(timeRange), [timeRange]);

  const {
    data: series,
    isLoading,
    isFetching,
    isError,
  } = useGetDailyPatientSummarySeriesQuery(
    { startDate, endDate },
    {
      skip: auth.status !== 'authenticated',
    },
  );

  const chartData = React.useMemo(
    () =>
      series?.points.map((p) => ({
        date: p.date,
        newPatients: p.newPatients,
        followupPatients: p.followupPatients,
      })) ?? [],
    [series],
  );

  const description = React.useMemo(() => {
    switch (timeRange) {
      case '7d':
        return 'Showing total visitors for the last 7 days';
      case '30d':
        return 'Showing total visitors for the last 30 days';
      default:
        return 'Showing total visitors for the last 3 months';
    }
  }, [timeRange]);

  const loading = (isLoading || isFetching) && chartData.length === 0;

  return (
    <Card className="border-none bg-white/80 shadow-sm">
      <CardHeader className="flex items-center gap-1 space-y-0 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle className="text-base sm:text-lg">Visitors - Ratio</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Select value={timeRange} onValueChange={(value: TimeRange) => setTimeRange(value)}>
          <SelectTrigger
            className="hidden w-[150px] rounded-full border bg-white text-xs sm:ml-auto sm:flex"
            aria-label="Select time range"
          >
            <SelectValue placeholder="Last 3 months" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="90d" className="rounded-lg text-xs">
              Last 3 months
            </SelectItem>
            <SelectItem value="30d" className="rounded-lg text-xs">
              Last 30 days
            </SelectItem>
            <SelectItem value="7d" className="rounded-lg text-xs">
              Last 7 days
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-2">
        {auth.status !== 'authenticated' ? (
          <p className="text-xs text-gray-500">Log in to see visitors data.</p>
        ) : loading ? (
          <p className="text-xs text-gray-500">Loading visitors data…</p>
        ) : chartData.length === 0 || isError ? (
          <p className="text-xs text-gray-500">
            No visitors data available for the selected range.
          </p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[200px] 2xl:h-[260px] w-full"
          >
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="fillNewPatients" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-newPatients)" stopOpacity={0.85} />
                  <stop offset="95%" stopColor="var(--color-newPatients)" stopOpacity={0.1} />
                </linearGradient>

                <linearGradient id="fillFollowupPatients" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-followupPatients)" stopOpacity={0.9} />
                  <stop offset="95%" stopColor="var(--color-followupPatients)" stopOpacity={0.2} />
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} strokeDasharray="3 3" />

              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => {
                  const date = new Date(value as string);
                  return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  });
                }}
              />

              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(value) =>
                      new Date(value as string).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    }
                  />
                }
              />

              <Area
                dataKey="newPatients"
                type="natural"
                fill="url(#fillNewPatients)"
                stroke="var(--color-newPatients)"
                stackId="visitors"
              />
              <Area
                dataKey="followupPatients"
                type="natural"
                fill="url(#fillFollowupPatients)"
                stroke="var(--color-followupPatients)"
                stackId="visitors"
              />

              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
