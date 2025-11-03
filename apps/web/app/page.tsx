import Link from 'next/link';
import { Button } from '../components/ui/button';

export default function Page() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Dental Management System</h1>
      <p className="text-gray-600">
        Week 1 / Day 1 scaffold is ready. API is expected at{' '}
        <code className="px-1">localhost:4000</code>.
      </p>
      <div className="flex gap-3">
        <Link href="http://localhost:4000/health" target="_blank">
          <Button>Check API Health</Button>
        </Link>
      </div>
    </section>
  );
}
