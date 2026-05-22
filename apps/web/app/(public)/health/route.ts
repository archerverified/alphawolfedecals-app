// Edge-runtime health endpoint. Returns { status: 'ok', commit } for
// monitoring tools and as the first verification of a new deploy.
//
// Edge runtime: no Prisma, no Node APIs, zero cold-start. If DB liveness
// is added later, move to Node runtime (Prisma is incompatible with Edge).
export const runtime = 'edge';

export function GET(): Response {
  return Response.json({
    status: 'ok',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
  });
}
