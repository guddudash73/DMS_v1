import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ClinicLayoutClient from './ClinicLayoutClient';

export const dynamic = 'force-dynamic';

const REFRESH_COOKIE = 'refreshToken';

export default async function ClinicLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const hasRefresh = Boolean(cookieStore.get(REFRESH_COOKIE)?.value);

  if (!hasRefresh) {
    redirect('/login');
  }

  return <ClinicLayoutClient>{children}</ClinicLayoutClient>;
}
