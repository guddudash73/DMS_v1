// apps/web/src/lib/printing/escpos.ts
import type { TokenPrintPayload } from '@dcm/types';
import { CLINIC_TZ } from '../clinicTime';

const ESC = '\x1B';
const GS = '\x1D';
const LF = '\x0A';

function hr() {
  return '-------------------------------' + LF;
}

/** ✅ Time only (no date) */
function fmtTime(ms: number) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: CLINIC_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ms));
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

function calcAgeFromDob(dobIso: string, atMs: number): number | null {
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
  if (s === 'MALE' || s === 'M') return 'M';
  if (s === 'FEMALE' || s === 'F') return 'F';
  if (s === 'OTHER' || s === 'O') return 'O';
  if (s === 'UNKNOWN' || s === 'U') return 'U';
  return undefined;
}

function blankLines(n: number) {
  let out = '';
  for (let i = 0; i < n; i++) out += LF;
  return out;
}

function pickAge(p: TokenPrintPayload): number | null {
  // ✅ 1) Prefer explicit age from payload (when patient stores age)
  if (typeof p.patientAge === 'number' && Number.isFinite(p.patientAge) && p.patientAge >= 0) {
    return p.patientAge;
  }

  // ✅ 2) Else compute from DOB (when patient stores dob)
  if (p.patientDob) {
    return calcAgeFromDob(p.patientDob, p.createdAt);
  }

  return null;
}

export function buildTokenEscPos(p: TokenPrintPayload): string {
  const patientName = String(p.patientName ?? '').slice(0, 32);

  // ✅ Unmasked phone
  const phone = p.patientPhone ? String(p.patientPhone).slice(0, 32) : '';

  const reason = String(p.reason ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);

  const visitNo = p.visitNumberForPatient;
  const patientNo = typeof p.dailyPatientNumber === 'number' ? p.dailyPatientNumber : p.tokenNumber;

  const opdNo = p.opdNo ? String(p.opdNo).slice(0, 32) : '';
  const sdId = p.sdId ? String(p.sdId).slice(0, 32) : '';

  const age = pickAge(p);
  const sx = sexShort(p.patientGender);

  const ageSex = age !== null && sx ? `${age}/${sx}` : age !== null ? `${age}` : sx ? `${sx}` : '';

  const timeOnly = fmtTime(p.createdAt);

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

  // ✅ Start directly with Patient line (no clinic heading)
  out += alignCenter;
  out += boldOn + sizeBig;
  out += `Patient: ${patientNo}${LF}`;
  out += sizeNormal + boldOff;
  out += LF;

  out += hr();

  out += alignLeft;
  out += `Name   : ${patientName}${LF}`;
  if (phone) out += `Phone  : ${phone}${LF}`;
  if (ageSex) out += `Age/Sex: ${ageSex}${LF}`;
  if (sdId) out += `SD ID  : ${sdId}${LF}`;
  if (opdNo) out += `OPD No : ${opdNo}${LF}`;

  out += `Reason : ${reason}${LF}`;

  // ✅ Tag + Date removed
  out += `Visit# : ${visitNo}${LF}`;
  out += `Time   : ${timeOnly}${LF}`;

  out += LF;
  out += hr();

  out += boldOn + `Medical History (tick):` + LF + boldOff;
  out += `[ ] Diabetes` + LF;
  out += `[ ] Blood Pressure` + LF;
  out += `[ ] Heart Problem` + LF;
  out += `[ ] Blood Thinner` + LF;
  out += `[ ] Gastritis` + LF;
  out += `[ ] Drug Allergy` + LF;
  out += `[ ] Asthma` + LF;
  out += `[ ] Steriod` + LF;
  out += `[ ] Hepatitis` + LF;
  out += `[ ] HIV` + LF;

  out += hr();

  out += boldOn + `Procedure:` + LF + boldOff;
  out += blankLines(4);

  out += hr();

  out += boldOn + `Next Appt.:` + LF + boldOff;
  out += blankLines(2);

  out += hr();

  out += boldOn + `Payment:` + LF + boldOff;
  out += blankLines(2);

  out += hr();

  out += boldOn + `Asst.:` + LF + boldOff;
  out += blankLines(2);

  out += cut;

  return out;
}
