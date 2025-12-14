import { Skeleton } from '@/components/ui/skeleton';

export default function LoadingPatients() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <Skeleton className="h-6 w-40"></Skeleton>
      <Skeleton className="h-32 rounded-2xl"></Skeleton>
    </div>
  );
}
