// Cascade level 3: models for a year + make. Public, published-only.
import { vehicles } from '@alphawolf/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request): Promise<Response> {
  const sp = new URL(request.url).searchParams;
  const year = Number(sp.get('year'));
  const make = sp.get('make');
  if (!Number.isInteger(year) || !make) return NextResponse.json([], { status: 200 });
  return NextResponse.json(await vehicles.listModels(year, make));
}
