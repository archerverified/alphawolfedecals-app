import type { MetadataRoute } from 'next';

// Pre-launch posture: the MVP is in investor-demo state, not intended for public
// search indexing yet. Disallow all crawling until public launch — at which
// point this should flip to an allow-list plus a sitemap. Tracked as a launch
// blocker in docs/deployment/audits/2026-06-09-goal-4/production-readiness.md (#20).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
