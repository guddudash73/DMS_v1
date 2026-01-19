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
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useAuth } from '@/src/hooks/useAuth';
import { useGetDailyPatientSummarySeriesQuery } from '@/src/store/api';
import { cn } from '@/lib/utils';
import { CLINIC_TZ, clinicDateISO } from '@/src/lib/clinicTime';

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

  let days = 90;
  if (range === '30d') days = 30;
  if (range === '7d') days = 7;

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));

  return {
    startDate: clinicDateISO(start),
    endDate: clinicDateISO(end),
  };
}

function formatShortDate(value: unknown) {
  const dateIso = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return dateIso;

  const dt = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return dateIso;

  return new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TZ,
    month: 'short',
    day: 'numeric',
  }).format(dt);
}

type TooltipPayloadItem = {
  dataKey?: string | number;
  color?: string;
  payload?: Record<string, unknown>;
};

type TooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: unknown;
};

function VisitorsTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;

  const row = payload?.[0]?.payload ?? {};
  const newCount = Number(row.newPatients ?? 0);
  const followupCount = Number(row.followupPatients ?? 0);
  const totalVisitors = newCount + followupCount;
  const zeroBilledRaw = Number(row.zeroBilledVisits ?? 0);
  const zeroBilled = Math.max(0, Math.min(zeroBilledRaw, totalVisitors));
  const billed = Math.max(0, totalVisitors - zeroBilled);

  const items = [
    {
      key: 'newPatients',
      label: 'New (N)',
      value: newCount,
      color: payload.find((p) => p.dataKey === 'newPatients')?.color,
    },
    {
      key: 'followupPatients',
      label: 'Followup (F)',
      value: followupCount,
      color: payload.find((p) => p.dataKey === 'followupPatients')?.color,
    },
  ];

  return (
    <div className="grid min-w-48 gap-2 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <div className="font-medium">{formatShortDate(label)}</div>

      <div className="grid gap-1.5">
        {items.map((it) => (
          <div key={it.key} className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-[3px]"
                style={{ backgroundColor: it.color || 'var(--muted-foreground)' }}
              />
              <span className="text-muted-foreground">{it.label}</span>
            </div>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {Number(it.value).toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      <div className="h-px w-full bg-border/60" />

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Visitors total (N+F)</span>
        <span className="font-mono font-semibold tabular-nums text-foreground">
          {Number(totalVisitors).toLocaleString()}
        </span>
      </div>

      <div className="mt-1 grid gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Billed</span>
          <span className="font-mono font-medium tabular-nums text-foreground">
            {Number(billed).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Zero billed (Z)</span>
          <span className="font-mono font-medium tabular-nums text-foreground">
            {Number(zeroBilled).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="pt-1 text-[11px] text-muted-foreground">Click to view daily breakdown →</div>
    </div>
  );
}

export type VisitorsRatioChartProps = {
  onDateSelect?: (dateIso: string) => void;
  title?: string;
};

type ChartClickEvent = {
  activePayload?: Array<{ payload?: { date?: unknown } }>;
  activeLabel?: unknown;
};

export default function VisitorsRatioChart({
  onDateSelect,
  title = 'Visitors - Ratio',
}: VisitorsRatioChartProps) {
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
    { skip: auth.status !== 'authenticated' },
  );

  const chartData = React.useMemo(
    () =>
      series?.points.map((p) => ({
        date: p.date,
        newPatients: p.newPatients,
        followupPatients: p.followupPatients,
        zeroBilledVisits: p.zeroBilledVisits,
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
          <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>

        <Select value={timeRange} onValueChange={(value: TimeRange) => setTimeRange(value)}>
          <SelectTrigger
            className="hidden w-37.5 rounded-full border bg-white text-xs sm:ml-auto sm:flex cursor-pointer"
            aria-label="Select time range"
          >
            <SelectValue placeholder="Last 3 months" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="90d" className="rounded-lg text-xs cursor-pointer">
              Last 3 months
            </SelectItem>
            <SelectItem value="30d" className="rounded-lg text-xs cursor-pointer">
              Last 30 days
            </SelectItem>
            <SelectItem value="7d" className="rounded-lg text-xs cursor-pointer">
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
          <ChartContainer config={chartConfig} className={cn('aspect-auto h-45 2xl:h-55 w-full')}>
            <AreaChart
              data={chartData}
              onClick={(e: ChartClickEvent) => {
                const dateFromPayload = e?.activePayload?.[0]?.payload?.date;
                const dateFromLabel = e?.activeLabel;
                const date = typeof dateFromPayload === 'string' ? dateFromPayload : dateFromLabel;
                if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
                  onDateSelect?.(date);
                }
              }}
              style={{ cursor: onDateSelect ? 'pointer' : 'default' }}
            >
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
                tickFormatter={(value) => formatShortDate(value)}
              />

              <ChartTooltip cursor={false} content={<VisitorsTooltip />} />

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
