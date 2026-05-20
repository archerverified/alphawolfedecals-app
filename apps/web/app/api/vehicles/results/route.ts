// Filtered results for the cascade + facet selections. Public, published-only.
// trim is tri-state: absent = any, "__base__" = the base (null) trim, else exact.
import { vehicles, type CascadeFilter, type BodyType } from '@alphawolf/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request): Promise<Response> {
  const sp = new URL(request.url).searchParams;
  const year = Number(sp.get('year'));
  const make = sp.get('make');
  const model = sp.get('model');
  if (!Number.isInteger(year) || !make || !model) {
    return NextResponse.json([], { status: 200 });
  }

  const trimParam = sp.get('trim');
  const filter: CascadeFilter = {
    year,
    make,
    model,
    trim: trimParam === null ? undefined : trimParam === '__base__' ? null : trimParam,
    bodyType: (sp.get('bodyType') as BodyType | null) ?? undefined,
    cabSize: sp.get('cabSize') ?? undefined,
    bedSize: sp.get('bedSize') ?? undefined,
    roofHeight: sp.get('roofHeight') ?? undefined,
  };
  return NextResponse.json(await vehicles.findPublished(filter));
}
