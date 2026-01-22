import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminLayoutClient from './AdminLayoutClient';

export const dynamic = 'force-dynamic';

const REFRESH_COOKIE = 'refreshToken';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const hasRefresh = Boolean(cookieStore.get(REFRESH_COOKIE)?.value);

  if (!hasRefresh) {
    redirect('/login?from=/admin');
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
