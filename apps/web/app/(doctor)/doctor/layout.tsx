import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import DoctorLayoutClient from './DoctorLayoutClient';

export const dynamic = 'force-dynamic';

const REFRESH_COOKIE = 'refreshToken';

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const hasRefresh = Boolean(cookieStore.get(REFRESH_COOKIE)?.value);

  if (!hasRefresh) {
    redirect('/login?from=/doctor');
  }

  return <DoctorLayoutClient>{children}</DoctorLayoutClient>;
}
