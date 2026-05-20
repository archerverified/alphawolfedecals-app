// Cascade level 2: makes for a year. Public, published-only (withSystem).
import { vehicles } from '@alphawolf/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request): Promise<Response> {
  const year = Number(new URL(request.url).searchParams.get('year'));
  if (!Number.isInteger(year)) return NextResponse.json([], { status: 200 });
  return NextResponse.json(await vehicles.listMakes(year));
}
