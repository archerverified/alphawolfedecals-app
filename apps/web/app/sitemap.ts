import type { MetadataRoute } from 'next';
import { vehicles } from '@alphawolf/db';
import { appBaseUrl } from '../lib/base-url';

// Public sitemap (Goal 10 D6). Lists the indexable marketing/discovery surface:
// the landing page, the vehicle catalogue, and each published vehicle's detail
// page. Account/editor/API/auth routes are intentionally excluded (also
// robots-disallowed). Crawlers only fetch this once indexing is opened
// (APP_ALLOW_INDEXING), so it's safe to serve the launch-ready map year-round.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appBaseUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/vehicles`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
  ];

  let vehicleRoutes: MetadataRoute.Sitemap = [];
  try {
    const templates = await vehicles.listAlphaWolfTemplates();
    vehicleRoutes = templates.map((t) => ({
      url: `${base}/vehicles/${t.id}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));
  } catch {
    // A DB hiccup must never 500 the sitemap — serve the static routes.
  }

  return [...staticRoutes, ...vehicleRoutes];
}
