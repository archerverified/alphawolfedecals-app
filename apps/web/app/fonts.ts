import localFont from 'next/font/local';

// Geist — the Alpha Wolf design-system typeface (Goal 14 D2). Self-hosted from
// the committed alpha-wolf-design skill woff2 (geist@1.7.0 variable axis), so we
// add no npm dependency. `display: 'optional'` per the system's font-decision
// rationale: under slow networks it avoids a visible system-ui → Geist swap
// (zero visual shift, clean Speed Index); the system-ui fallback reads cleanly.
export const geistSans = localFont({
  src: '../fonts/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'optional',
});

export const geistMono = localFont({
  src: '../fonts/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'optional',
});

export const fontVariables = `${geistSans.variable} ${geistMono.variable}`;
