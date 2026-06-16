// Shop order detail (Goal 3b PR2).
//
// Server Component: gate to a shop member, load the order through the shop path
// (getShopOrder enforces ownerShopId ∈ the caller's shops on top of the
// orders_shop_read RLS policy), 404 if it isn't theirs, and render the contact
// details + delivery notes + status-transition controls. Order-centric: the
// customer's project/version rows are invisible on the RLS connection.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { orders } from '@alphawolf/db';
import { requireShopUser } from '@/lib/shop/guard';
import { OrderStatusBadge } from '@/components/dashboard/OrderStatusBadge';
import { OrderActions } from '@/components/dashboard/OrderActions';
import { OrderViewed } from '@/components/dashboard/OrderViewed';
import { formatOrderDate } from '@/lib/shop/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return { title: `Order #${orderId.slice(0, 8)}` };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-zinc-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-zinc-900">{value}</dd>
    </div>
  );
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const { user, shopIds } = await requireShopUser(`/dashboard/orders/${orderId}`);
  const order = await orders.getShopOrder(user.id, orderId, shopIds);
  if (!order) notFound();

  const shortId = order.id.slice(0, 8);

  return (
    <>
      <OrderViewed orderId={order.id} status={order.status} />
      <div className="flex flex-col gap-6" data-testid="order-detail">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeft className="size-4" aria-hidden /> Production queue
        </Link>

        <div className="flex items-center gap-3">
          <h1 className="font-mono text-xl font-semibold text-zinc-900">#{shortId}</h1>
          <OrderStatusBadge status={order.status} />
        </div>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Customer</h2>
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <Field label="Name" value={order.contactName} />
            <Field label="Email" value={order.contactEmail} />
            <Field label="Phone" value={order.contactPhone ?? '—'} />
            <Field label="Submitted" value={formatOrderDate(order.createdAt)} />
            <Field label="Last updated" value={formatOrderDate(order.updatedAt)} />
          </dl>
          {order.deliveryNotes ? (
            <div className="mt-4">
              <dt className="text-xs tracking-wide text-zinc-500 uppercase">Delivery notes</dt>
              <dd className="mt-1 text-sm whitespace-pre-wrap text-zinc-800">
                {order.deliveryNotes}
              </dd>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Update status</h2>
          <p className="mt-1 text-sm text-zinc-600">Move this order through production.</p>
          <div className="mt-4">
            <OrderActions orderId={order.id} status={order.status} />
          </div>
        </section>
      </div>
    </>
  );
}
