// Cascade level 4 (one round-trip): once a model is chosen, return the trim
// options, the body-type-specific facets, and the matching templates together.
import { vehicles } from '@alphawolf/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request): Promise<Response> {
  const sp = new URL(request.url).searchParams;
  const year = Number(sp.get('year'));
  const make = sp.get('make');
  const model = sp.get('model');
  if (!Number.isInteger(year) || !make || !model) {
    return NextResponse.json({ trims: [], facets: null, results: [] }, { status: 200 });
  }
  const [trims, facets, results] = await Promise.all([
    vehicles.listTrims(year, make, model),
    vehicles.getFacets(year, make, model),
    vehicles.findPublished({ year, make, model }),
  ]);
  return NextResponse.json({ trims, facets, results });
}
