'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@/src/store';
import { useAuth } from '@/src/hooks/useAuth';
import { useRefreshMutation } from '@/src/store/api';
import { setChecking, setUnauthenticated } from '@/src/store/authSlice';

const isPublicPath = (pathname: string) => pathname === '/login';

let bootstrapPromise: Promise<'ok' | 'fail'> | null = null;

export default function AuthReadyGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch<AppDispatch>();
  const auth = useAuth();
  const [refresh] = useRefreshMutation();

  useEffect(() => {
    if (auth.status !== 'checking') return;

    if (isPublicPath(pathname)) {
      dispatch(setUnauthenticated());
      return;
    }

    // dispatch(setChecking());

    if (!bootstrapPromise) {
      bootstrapPromise = (async () => {
        try {
          await refresh().unwrap();
          return 'ok' as const;
        } catch {
          return 'fail' as const;
        }
      })().finally(() => {
        bootstrapPromise = null;
      });
    }

    (async () => {
      const result = await bootstrapPromise;
      if (result === 'ok') return;

      dispatch(setUnauthenticated());
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
    })();
  }, [auth.status, dispatch, pathname, refresh, router]);

  if (auth.status === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-700">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
