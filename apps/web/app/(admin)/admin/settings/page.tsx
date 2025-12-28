import { Card } from '@/components/ui/card';

export default function AdminSettingsPage() {
  return (
    <div className="p-4 2xl:p-12">
      <div className="mb-6">
        <p className="mt-1 text-sm text-gray-600">System-wide configuration for the clinic.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border bg-white p-5 shadow-none">
          <div className="text-sm font-semibold text-gray-900">Security</div>
          <div className="mt-1 text-[11px] text-gray-500">
            JWT, session rules, role-based access policies.
          </div>
        </Card>

        <Card className="rounded-2xl border bg-white p-5 shadow-none">
          <div className="text-sm font-semibold text-gray-900">Clinic Defaults</div>
          <div className="mt-1 text-[11px] text-gray-500">
            Defaults for medicines/presets and template behavior.
          </div>
        </Card>
      </div>
    </div>
  );
}
