// Serves vehicle template assets (outline SVGs, thumbnails) from the local
// asset store. Public catalog data — no auth. STOPGAP for real blob storage
// (GH-005); see packages/db/src/storage/vehicle-assets.ts.

import { vehicleAssets } from '@alphawolf/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ vehicleId: string; filename: string }> },
): Promise<Response> {
  const { vehicleId, filename } = await params;
  const data = vehicleAssets.readVehicleAsset(vehicleId, filename);
  if (!data) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': vehicleAssets.contentTypeFor(filename),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
