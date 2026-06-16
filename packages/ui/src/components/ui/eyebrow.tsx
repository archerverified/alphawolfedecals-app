import * as React from 'react';

import { cn } from '@alphawolf/ui/lib/utils';

// Eyebrow — the design system's signature device: a small UPPERCASE, wide-tracked,
// zinc-subtle label above a page title or section header (e.g. CONFIGURATION, UPLOAD,
// ALPHA WOLF WRAP STUDIO). Grey, never cyan. Sentence content, set in caps via CSS.
function Eyebrow({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="eyebrow"
      className={cn('text-xs font-medium tracking-[0.1em] text-zinc-500 uppercase', className)}
      {...props}
    />
  );
}

export { Eyebrow };
