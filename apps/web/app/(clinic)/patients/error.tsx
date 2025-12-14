'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function PatientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: replace with structured logger
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
      <div className="font-medium text-red-700">Something went wrong</div>
      <pre className="mt-2 overflow-x-auto text-xs text-red-800">{error.message}</pre>
      <div className="mt-3">
        <Button variant="secondary" size="sm" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
