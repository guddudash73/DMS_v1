'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/src/hooks/useAuth';
import { useGetVisitBillQuery } from '@/src/store/api';

export default function VisitCheckoutEntryPage() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();
  const auth = useAuth();
  const visitId = String(params?.visitId ?? '');

  const role = auth.status === 'authenticated' ? auth.role : undefined;
  const isAdmin = role === 'ADMIN';

  const billQuery = useGetVisitBillQuery({ visitId }, { skip: !visitId });
  const bill = billQuery.data ?? null;
  const billNotFound = (billQuery as any)?.error?.status === 404;

  React.useEffect(() => {
    if (!visitId) return;
    if (billQuery.isLoading || billQuery.isFetching) return;

    if (bill) {
      router.replace(
        isAdmin ? `/visits/${visitId}/checkout/billing` : `/visits/${visitId}/checkout/printing`,
      );
      return;
    }

    if (billNotFound) {
      router.replace(`/visits/${visitId}/checkout/billing`);
      return;
    }
  }, [visitId, bill, billNotFound, billQuery.isLoading, billQuery.isFetching, isAdmin, router]);

  return <div className="p-6 text-sm text-gray-600">Loading…</div>;
}
