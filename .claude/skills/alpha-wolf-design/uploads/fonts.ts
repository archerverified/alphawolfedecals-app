// Centralized font module, single source of truth for Alpha Wolf Decals
// typography. The PRD's first-choice typeface is unlicensed for third-party
// commercial use; the locked fallback is Geist (Vercel, SIL OFL 1.1) at exact
// pin geist@1.7.0. See docs/font-decision.md for the full rationale, license
// audit, and propagation checklist.
//
// Self-hosted via next/font/local pointing at the .woff2 files inside the
// geist npm package, no mirroring into public/fonts/ (which docs/font-
// decision.md Section 5 + Section 8 item 5 forbid). We define our own
// next/font/local config rather than re-exporting `geist/font/sans` so we
// can set `display: 'optional'`: under simulated 4G mobile, font-display:
// swap was causing a visible swap from system-ui → Geist around the 6-9 s
// mark, which Lighthouse counted as "visual change" and dragged Speed Index.
// `optional` uses the fallback for the entire session if the font isn't
// ready in ~100 ms, giving zero visual swap and a clean SI curve. The
// fallback chain (system-ui → -apple-system → sans-serif) reads cleanly.

import localFont from 'next/font/local'

export const sansFont = localFont({
  src: '../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'optional',
})

export const monoFont = localFont({
  src: '../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'optional',
})

export const fontVariables = `${sansFont.variable} ${monoFont.variable}`
