// Free-text, typo-tolerant search ("transt 250" -> Transit 250). Public.
import { vehicles } from '@alphawolf/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json([], { status: 200 });
  return NextResponse.json(await vehicles.searchPublished(q));
}
