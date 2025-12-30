export const CLINIC_TIME_ZONE = 'Asia/Kolkata' as const;

type YMDParts = { year: string; month: string; day: string };

function ymdPartsInTimeZone(date: Date, timeZone: string): YMDParts {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const get = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value;

    const year = get('year');
    const month = get('month');
    const day = get('day');

    if (!year || !month || !day) {
      throw new Error(`Intl.formatToParts missing Y/M/D for timezone=${timeZone}`);
    }

    return { year, month, day };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to compute date parts for timezone "${timeZone}". ` +
        `Ensure runtime has full ICU / tz data. Root error: ${msg}`,
    );
  }
}

export function isoDateInTimeZone(
  date: Date = new Date(),
  timeZone: string = CLINIC_TIME_ZONE,
): string {
  const { year, month, day } = ymdPartsInTimeZone(date, timeZone);
  return `${year}-${month}-${day}`;
}

export function clinicDateISO(date: Date = new Date()): string {
  return isoDateInTimeZone(date, CLINIC_TIME_ZONE);
}

export function clinicDateISOFromMs(ms: number): string {
  return isoDateInTimeZone(new Date(ms), CLINIC_TIME_ZONE);
}

export function clinicTimeParts(date: Date = new Date()): {
  yyyy: string;
  mm: string;
  dd: string;
  hh: string;
  min: string;
  ss: string;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  return {
    yyyy: get('year'),
    mm: get('month'),
    dd: get('day'),
    hh: get('hour'),
    min: get('minute'),
    ss: get('second'),
  };
}
