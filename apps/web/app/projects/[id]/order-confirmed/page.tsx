// Order confirmation page (Goal 3a PR5). Shown after a successful
// submit-for-production. Server Component: authorise, resolve the order (prefer
// the ?order=<id> query, fall back to the project's newest order so a refresh
// without the param still works), and render the confirmation.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { orders } from '@alphawolf/db';
import { Button } from '@alphawolf/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@alphawolf/ui/components/ui/card';
import { Eyebrow } from '@alphawolf/ui/components/ui/eyebrow';
import { requireUser } from '../../../../lib/admin/guard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Order submitted',
};

export default async function OrderConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { id: projectId } = await params;
  const { order: orderId } = await searchParams;
  const user = await requireUser(`/projects/${projectId}/order-confirmed`);

  let order = orderId ? await orders.getOrder(user.id, orderId) : null;
  if (!order || order.projectId !== projectId) {
    const list = await orders.listOrders(user.id, projectId);
    order = list[0] ?? null;
  }
  if (!order) notFound();

  const shortId = order.id.slice(0, 8);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-12">
      <Card className="w-full" data-testid="order-confirmed">
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="size-10 text-emerald-600" aria-hidden />
          <Eyebrow className="mt-3">Submitted</Eyebrow>
          <CardTitle className="mt-1 text-2xl">Your design is in the queue</CardTitle>
          <CardDescription>
            The production team will review it and reach out to {order.contactEmail} to confirm the
            details.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-y-2 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
            <dt className="text-zinc-500">Order</dt>
            <dd className="text-right font-mono text-zinc-900">#{shortId}</dd>
            <dt className="text-zinc-500">Status</dt>
            <dd className="text-right capitalize text-zinc-900">{order.status}</dd>
            <dt className="text-zinc-500">Contact</dt>
            <dd className="truncate text-right text-zinc-900">{order.contactName}</dd>
          </dl>
          <p className="text-sm text-zinc-600">
            You can keep editing — submitting locked in this version, and your next changes start a
            fresh draft.
          </p>
          <div className="flex justify-center gap-2">
            <Button asChild variant="outline">
              <Link href={`/projects/${projectId}/editor`}>Back to editor</Link>
            </Button>
            <Button asChild>
              <Link href="/projects">My projects</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
