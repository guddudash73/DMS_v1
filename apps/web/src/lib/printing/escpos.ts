import type { TokenPrintPayload } from '@dcm/types';
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

function parseDobIso(dob?: string): { y: number; m: number; d: number } | null {
  if (!dob) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) return null;
  return { y, m: mo, d: da };
}

function calcAge(dobIso: string, atMs: number): number | null {
  const p = parseDobIso(dobIso);
  if (!p) return null;

  const at = new Date(atMs);
  const ay = at.getFullYear();
  const am = at.getMonth() + 1;
  const ad = at.getDate();

  let age = ay - p.y;
  if (am < p.m || (am === p.m && ad < p.d)) age -= 1;
  if (!Number.isFinite(age) || age < 0) return null;
  return age;
}

function sexShort(g?: string): string | undefined {
  if (!g) return undefined;
  const s = String(g).toUpperCase().trim();
  if (s === 'MALE') return 'M';
  if (s === 'FEMALE') return 'F';
  if (s === 'OTHER') return 'O';
  if (s === 'UNKNOWN') return 'U';
  return undefined;
}

function blankLines(n: number) {
  let out = '';
  for (let i = 0; i < n; i++) out += LF;
  return out;
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
  const offline = !!p.isOffline;
  const visitNo = p.visitNumberForPatient;
  const patientNo = typeof p.dailyPatientNumber === 'number' ? p.dailyPatientNumber : p.tokenNumber;
  const created = fmtDateTime(p.createdAt);
  const opdNo = p.opdNo ? String(p.opdNo).slice(0, 32) : '';
  const sdId = p.sdId ? String(p.sdId).slice(0, 32) : '';
  const age = p.patientDob ? calcAge(p.patientDob, p.createdAt) : null;
  const sx = sexShort(p.patientGender);
  const ageSex = age !== null && sx ? `${age}/${sx}` : age !== null ? `${age}` : sx ? `${sx}` : '';
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
  out += `PATIENT NO: ${patientNo}${LF}`;
  out += boldOff;
  out += hr();

  out += alignLeft;
  out += `Name   : ${patientName}${LF}`;
  if (phoneMasked) out += `Phone  : ${phoneMasked}${LF}`;
  if (ageSex) out += `Age/Sex: ${ageSex}${LF}`;
  if (sdId) out += `SD ID  : ${sdId}${LF}`;
  if (opdNo) out += `OPD No : ${opdNo}${LF}`;

  out += `Reason : ${reason}${LF}`;
  out += `Tag    : ${offline ? `${tag} / OFFLINE` : tag}${LF}`;

  out += `Visit# : ${visitNo}${LF}`;
  out += `Time   : ${created}${LF}`;
  out += `Date   : ${p.visitDate}${LF}`;

  out += LF;
  out += hr();

  out += boldOn + `Medical History (tick):` + LF + boldOff;
  out += `[ ] Diabetes` + LF;
  out += `[ ] BP` + LF;
  out += `[ ] Hepatitis` + LF;
  out += `[ ] HIV` + LF;
  out += `[ ] Asthma` + LF;
  out += `[ ] Steriod` + LF;
  out += `[ ] Blood Thinner` + LF;
  out += `[ ] Heart Medicine` + LF;
  out += `[ ] Drug Allergy` + LF;

  out += hr();

  out += boldOn + `Procedure:` + LF + boldOff;
  out += blankLines(2);

  out += hr();

  out += blankLines(6);

  out += alignCenter;
  out += `Please wait for your turn` + LF;
  out += `THANK YOU.` + LF;
  out += LF + LF;

  out += cut;

  return out;
}
