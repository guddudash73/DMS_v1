export const CLINIC_TZ = 'Asia/Kolkata' as const;

export function clinicDateISO(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);

  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);

  return clinicDateISO(utc);
}

export function formatClinicDateShort(dateISO: string): string {
  const dt = new Date(`${dateISO}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return dateISO;

  return new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TZ,
    month: 'short',
    day: 'numeric',
  }).format(dt);
}

export function formatClinicDatePretty(dateISO: string): string {
  const dt = new Date(`${dateISO}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return dateISO;

  return new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(dt);
}

export function formatClinicTimeFromMs(tsMs: number): string {
  const dt = new Date(tsMs);
  if (Number.isNaN(dt.getTime())) return '';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(dt);
}

export function clinicDateISOFromMs(tsMs: number): string {
  return clinicDateISO(new Date(tsMs));
}

export function formatClinicDateTimeFromMs(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: CLINIC_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}
