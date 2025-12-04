export const normalizePhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) {
    return '';
  }

  const local = digits.slice(-10);
  return `+91${local}`;
};
