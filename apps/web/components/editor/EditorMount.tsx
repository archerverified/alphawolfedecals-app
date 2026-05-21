'use client';

// Client wrapper imported by the server route (ADR-0006 §8). This is the
// ssr:false boundary: CanvasEditor (and therefore Konva/react-konva) is loaded
// only in the browser, so Konva never reaches SSR.

import dynamic from 'next/dynamic';
import { Skeleton } from '@alphawolf/ui/components/ui/skeleton';
import type { EditorProps } from './contract';

const CanvasEditor = dynamic(() => import('./CanvasEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-100">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[480px] w-[720px]" />
      </div>
    </div>
  ),
});

export function EditorMount(props: EditorProps) {
  return <CanvasEditor {...props} />;
}
