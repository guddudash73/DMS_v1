import type { TokenPrintPayload } from '@dms/types';
import { CLINIC_TZ } from '../clinicTime';

const ESC = '\x1B';
const GS = '\x1D';
const LF = '\x0A';

function hr() {
  return '-------------------------------' + LF;
}

function fmtDateTime(ms: number) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: CLINIC_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ms));
}

function maskPhone(phone?: string) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  const last4 = digits.slice(-4);
  return `XXXXXX${last4}`;
}

export function buildTokenEscPos(p: TokenPrintPayload): string {
  const clinicName = (p.clinicName ?? 'SARANGI DENTISTRY').slice(0, 32);
  const clinicPhone = p.clinicPhone ? String(p.clinicPhone).slice(0, 32) : '';

  const patientName = String(p.patientName ?? '').slice(0, 32);
  const phoneMasked = maskPhone(p.patientPhone);

  const reason = String(p.reason ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);

  const tag = p.tag ?? 'N';
  const offline = !!(p as any).isOffline;

  const visitNo = p.visitNumberForPatient;
  const waitingNo = p.tokenNumber;
  const created = fmtDateTime(p.createdAt);

  const init = ESC + '@';
  const alignLeft = ESC + 'a' + '\x00';
  const alignCenter = ESC + 'a' + '\x01';
  const boldOn = ESC + 'E' + '\x01';
  const boldOff = ESC + 'E' + '\x00';

  const sizeNormal = GS + '!' + '\x00';
  const sizeBig = GS + '!' + String.fromCharCode((2 << 3) | 1);

  const cut = GS + 'V' + 'B' + '\x00';

  let out = '';
  out += init;

  out += alignCenter;
  out += boldOn + sizeBig;
  out += `${clinicName}${LF}`;
  out += sizeNormal + boldOff;

  if (clinicPhone) out += `${clinicPhone}${LF}`;
  out += LF;

  out += hr();
  out += boldOn;
  out += `WAITING NO: ${waitingNo}${LF}`;
  out += boldOff;
  out += hr();

  out += alignLeft;
  out += `Name   : ${patientName}${LF}`;
  if (phoneMasked) out += `Phone  : ${phoneMasked}${LF}`;
  out += `Reason : ${reason}${LF}`;

  // ✅ "offline tag" on token
  out += `Tag    : ${offline ? `${tag} / OFFLINE` : tag}${LF}`;

  out += `Visit# : ${visitNo}${LF}`;
  out += `VisitId: ${p.visitId}${LF}`;
  out += `Time   : ${created}${LF}`;
  out += `Date   : ${p.visitDate}${LF}`;

  out += LF;
  out += alignCenter;
  out += `Please wait for your turn${LF}`;
  out += `THANK YOU.${LF}`;
  out += LF + LF;

  out += cut;

  return out;
}
