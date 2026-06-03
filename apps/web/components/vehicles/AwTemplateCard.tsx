'use client';

// Curated catalogue card for the /vehicles browse grid (Goal 2a). Shows the
// wrapped-template thumbnail, make + model heading, a view-count badge, the wrap
// scale, and the "Use template" CTA into the detail route. Fires
// `vehicle_card_viewed` once when the card first scrolls into view.

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { AlphaWolfTemplateCard } from '@alphawolf/db';
import { capture } from '../../lib/analytics';

function makeModel(t: AlphaWolfTemplateCard): string {
  return [t.make, t.model].filter(Boolean).join(' ');
}

export function AwTemplateCard({ template }: { template: AlphaWolfTemplateCard }) {
  const ref = useRef<HTMLElement | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fire = (): void => {
      if (fired.current) return;
      fired.current = true;
      capture('vehicle_card_viewed', {
        vehicle_id: template.id,
        alpha_wolf_tpl_id: template.alphaWolfTplId,
        make: template.make,
        model: template.model,
      });
    };
    if (typeof IntersectionObserver === 'undefined') {
      fire();
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) fire();
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [template.id, template.alphaWolfTplId, template.make, template.model]);

  const title = makeModel(template);
  const views = template.viewCount ?? null;

  return (
    <article
      ref={ref}
      data-testid="vehicle-card"
      data-vehicle-id={template.id}
      className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-center justify-center overflow-hidden border-b border-zinc-100 bg-zinc-50 p-4">
        {/* Cross-origin <img> from the public vehicle-templates bucket. CSP
            img-src already allow-lists the Supabase Storage origin. */}
        <img
          src={template.thumbPngUrl}
          alt={`${title} — Alpha Wolf wrap template`}
          loading="lazy"
          className="aspect-[3/2] w-full object-contain"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          {views != null ? (
            <span
              data-testid="view-count-badge"
              className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600"
            >
              {views}-view
            </span>
          ) : null}
        </div>
        <p className="text-xs text-zinc-500">Scale 1:{template.scaleDenom}</p>
        <Link
          href={`/vehicles/${template.id}`}
          data-testid="use-template-cta"
          className="mt-auto inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Use template
        </Link>
      </div>
    </article>
  );
}
