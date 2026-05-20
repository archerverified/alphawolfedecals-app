import { getOrCreateFormCsrfToken } from '../../../../lib/csrf';
import { VehicleCreateForm } from '../../../../components/admin/VehicleCreateForm';

export const metadata = { title: 'New vehicle template — Admin' };

export default async function NewVehiclePage() {
  const csrfToken = await getOrCreateFormCsrfToken();
  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-zinc-900">New vehicle template</h1>
      <p className="mb-6 text-sm text-zinc-600">
        Enter the vehicle metadata and upload its 4-view outline SVG. The SVG is validated against
        the outline standard (§3.4) before the draft is created.
      </p>
      <VehicleCreateForm csrfToken={csrfToken} />
    </div>
  );
}
