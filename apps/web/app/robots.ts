import type { MetadataRoute } from 'next';
import { appBaseUrl } from '../lib/base-url';

// Launch indexing posture (Goal 10 D6). GATED behind APP_ALLOW_INDEXING so the
// flip is a one-env-var change at launch — the site stays fenced from crawlers
// until the launch blockers clear (see the D7 go/no-go checklist). Default
// (unset) keeps the pre-launch `Disallow: /` fence that's been live since #101.
//
// AI-CRAWLER DECISION (logged 2026-06-14, Goal 10): at launch we ALLOW standard
// SEARCH crawlers (the product must be discoverable) but DENY AI training/scraping
// crawlers. The wrap designs + vehicle catalogue are our content; search
// visibility is not consent to be a model-training corpus. Deliberate + reversible
// — drop a name from AI_CRAWLERS to opt back in.
const AI_CRAWLERS = [
  'GPTBot', // OpenAI training
  'OAI-SearchBot', // OpenAI search index
  'ChatGPT-User', // OpenAI on-demand fetch
  'ClaudeBot', // Anthropic
  'anthropic-ai', // Anthropic (legacy UA)
  'Claude-Web', // Anthropic
  'Google-Extended', // Google AI (Gemini/Vertex) training — separate from Googlebot
  'CCBot', // Common Crawl (feeds many LLMs)
  'PerplexityBot', // Perplexity
  'Bytespider', // ByteDance
  'Amazonbot', // Amazon
  'Applebot-Extended', // Apple AI training (Applebot search still allowed)
  'meta-externalagent', // Meta AI
  'Diffbot',
  'cohere-ai',
];

// Private / non-indexable surfaces — kept out of the index even once search is on.
const PRIVATE_PATHS = [
  '/api/',
  '/admin',
  '/dashboard',
  '/projects',
  '/editor',
  '/signin',
  '/signup',
  '/signup-shop',
  '/verify',
  '/refer',
  '/share/', // ephemeral per-link pages, already per-page noindex
];

export default function robots(): MetadataRoute.Robots {
  const base = appBaseUrl();

  // Pre-launch fence (default): nothing is crawlable yet.
  if (process.env.APP_ALLOW_INDEXING !== 'true') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  // Launch posture: search crawlers index public pages; AI crawlers fully denied.
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, disallow: '/' })),
    ],
    sitemap: `${base}/sitemap.xml`,
    host: new URL(base).host, // bare hostname (the Host: directive takes no scheme)
  };
}
