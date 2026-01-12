const CLINIC_TIMEZONE = 'Asia/Kolkata';

export const getDaySuffix = (day: number) => {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
};

export const deriveCurrentPanelFromPath = (pathname: string) => {
  if (pathname.startsWith('/doctor')) return 'DOCTOR' as const;
  if (pathname.startsWith('/admin')) return 'ADMIN' as const;
  return 'RECEPTION' as const;
};

export const buildDateTimeLabels = (now: Date) => {
  const dateParts = new Intl.DateTimeFormat('en-IN', {
    timeZone: CLINIC_TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).formatToParts(now);

  const weekday = dateParts.find((p) => p.type === 'weekday')?.value ?? '';
  const month = dateParts.find((p) => p.type === 'month')?.value ?? '';
  const day = Number(dateParts.find((p) => p.type === 'day')?.value ?? '');
  const year = dateParts.find((p) => p.type === 'year')?.value ?? '';

  const dateLabel = `${weekday} · ${day}${getDaySuffix(day)} ${month} ${year}`;

  const timeLabel = new Intl.DateTimeFormat('en-IN', {
    timeZone: CLINIC_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now);

  return { dateLabel, timeLabel };
};
