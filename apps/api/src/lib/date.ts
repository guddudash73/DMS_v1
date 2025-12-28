// apps/api/src/lib/date.ts

/**
 * Centralized clinic timezone utilities.
 *
 * ✅ Store timestamps as UTC epoch ms (Date.now()).
 * ✅ Derive "day keys" (YYYY-MM-DD) using clinic timezone (Asia/Kolkata).
 *
 * This prevents the midnight IST bug caused by UTC toISOString slicing.
 */

export const CLINIC_TIME_ZONE = 'Asia/Kolkata' as const;

type YMDParts = { year: string; month: string; day: string };

function ymdPartsInTimeZone(date: Date, timeZone: string): YMDParts {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      // ensure stable parts; we’ll assemble ourselves
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
    // Make tz/ICU problems obvious in logs
    throw new Error(
      `Failed to compute date parts for timezone "${timeZone}". ` +
        `Ensure runtime has full ICU / tz data. Root error: ${msg}`,
    );
  }
}

/**
 * Returns YYYY-MM-DD for a given timezone.
 * We use Asia/Kolkata because clinic operations are local-date based.
 */
export function isoDateInTimeZone(
  date: Date = new Date(),
  timeZone: string = CLINIC_TIME_ZONE,
): string {
  const { year, month, day } = ymdPartsInTimeZone(date, timeZone);
  return `${year}-${month}-${day}`;
}

/**
 * Convenience: clinic day key for "now" (Asia/Kolkata).
 */
export function clinicDateISO(date: Date = new Date()): string {
  return isoDateInTimeZone(date, CLINIC_TIME_ZONE);
}

/**
 * Convenience: clinic day key from epoch milliseconds.
 */
export function clinicDateISOFromMs(ms: number): string {
  return isoDateInTimeZone(new Date(ms), CLINIC_TIME_ZONE);
}

/**
 * Optional helper for logs/debugging.
 * Returns current time parts in clinic timezone.
 */
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
