// Shop dashboard — the production queue (Goal 3b PR1).
//
// Server Component: gate to a shop member, read the orders routed to their
// shop(s) through the orders_shop_read RLS policy (withUser-scoped), and render
// an order-centric table. The related project/version rows are owned by the
// customer and invisible to a shop member on the RLS connection, so the queue
// intentionally shows order fields only (contact, status, submitted-at).

import Link from 'next/link';
import { orders } from '@alphawolf/db';
import { requireShopUser } from '@/lib/shop/guard';
import { DashboardLoaded } from '@/components/dashboard/DashboardLoaded';
import { OrderStatusBadge } from '@/components/dashboard/OrderStatusBadge';
import { orderStatusPresentation, ORDER_STATUS_DISPLAY_ORDER } from '@/lib/shop/order-status';
import { formatOrderDate } from '@/lib/shop/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Production queue — Alpha Wolf Wrap Studio',
};

export default async function DashboardPage() {
  const { user, shopIds } = await requireShopUser('/dashboard');
  const rows = await orders.listShopOrders(user.id, shopIds);

  const counts = ORDER_STATUS_DISPLAY_ORDER.map((status) => ({
    status,
    label: orderStatusPresentation(status).label,
    count: rows.filter((r) => r.status === status).length,
  }));

  return (
    <>
      <DashboardLoaded orderCount={rows.length} />
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Production queue</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Orders submitted to your shop. Open one to move it through production.
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm" data-testid="status-summary">
          {counts.map(({ status, label, count }) => (
            <div key={status} className="flex items-baseline gap-1.5">
              <dt className="text-zinc-500">{label}</dt>
              <dd className="font-semibold tabular-nums text-zinc-900">{count}</dd>
            </div>
          ))}
        </dl>

        {rows.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-16 text-center"
            data-testid="dashboard-empty"
          >
            <p className="text-sm font-medium text-zinc-900">No orders yet</p>
            <p className="mt-1 text-sm text-zinc-500">
              Orders submitted to your shop will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm" data-testid="orders-table">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Order
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Customer
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Submitted
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                        className="font-mono font-medium text-zinc-900 underline-offset-2 hover:underline"
                        data-testid="order-link"
                      >
                        #{order.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{order.contactName}</div>
                      <div className="text-xs text-zinc-500">{order.contactEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-500">
                      {formatOrderDate(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
