// Production order repository (Goal 3a PR5).
//
// RLS-enforced per-user via withUser(userId): the orders_owner_all policy scopes
// rows to the session user (prisma/sql/auth_rls.sql). An order pins a FROZEN
// project_versions row (approval_state='submitted'); submitForProduction freezes
// that version and creates the order atomically in one transaction so a reader
// never sees a submitted order without its frozen version.
//
// No payment in the MVP. The shop dashboard (Goal 3b) drives status transitions;
// email notifications land in Goal 3c.

import type { OrderStatus, Prisma } from '@prisma/client';
import { withUser } from '../client.js';

export type { OrderStatus };

export type OrderRow = {
  id: string;
  projectId: string;
  projectVersionId: string;
  ownerUserId: string;
  ownerShopId: string | null;
  status: OrderStatus;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  deliveryNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const ORDER_SELECT = {
  id: true,
  projectId: true,
  projectVersionId: true,
  ownerUserId: true,
  ownerShopId: true,
  status: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  deliveryNotes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrderSelect;

export type SubmitResult =
  | { ok: true; orderId: string; status: OrderStatus }
  | { ok: false; reason: 'no_project' | 'no_working_version' };

// Submit a project for production. Atomically (one withUser transaction):
//   1. freeze the working version to 'submitted',
//   2. clone a fresh 'working' row forward (version+1) so the customer can keep
//      iterating post-submit (mirrors projects.snapshotVersion; ADR-0006 §4),
//   3. flip the project to 'active' if still a draft,
//   4. create the order pinning the frozen version + delivery details.
// RLS rejects a cross-user submit at the DB (the working-version EXISTS check and
// orders_owner_all WITH CHECK both require the session user own the project).
export function submitForProduction(
  userId: string,
  input: {
    projectId: string;
    contactName: string;
    contactEmail: string;
    contactPhone?: string | null;
    deliveryNotes?: string | null;
  },
): Promise<SubmitResult> {
  return withUser(userId, async (db) => {
    const project = await db.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, ownerShopId: true, status: true },
    });
    if (!project) return { ok: false, reason: 'no_project' };

    const working = await db.projectVersion.findFirst({
      where: { projectId: input.projectId, approvalState: 'working' },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, canvasState: true },
    });
    if (!working) return { ok: false, reason: 'no_working_version' };

    await db.projectVersion.update({
      where: { id: working.id },
      data: { approvalState: 'submitted' },
    });
    await db.projectVersion.create({
      data: {
        projectId: input.projectId,
        version: working.version + 1,
        canvasState: working.canvasState as Prisma.InputJsonValue,
        approvalState: 'working',
        rev: 0,
      },
    });
    if (project.status !== 'active') {
      await db.project.update({ where: { id: input.projectId }, data: { status: 'active' } });
    }

    const order = await db.order.create({
      data: {
        projectId: input.projectId,
        projectVersionId: working.id,
        ownerUserId: userId,
        ownerShopId: project.ownerShopId,
        status: 'submitted',
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone ?? null,
        deliveryNotes: input.deliveryNotes ?? null,
      },
      select: { id: true, status: true },
    });
    return { ok: true, orderId: order.id, status: order.status };
  });
}

export function getOrder(userId: string, orderId: string): Promise<OrderRow | null> {
  return withUser(userId, async (db) => {
    return db.order.findUnique({ where: { id: orderId }, select: ORDER_SELECT });
  });
}

// Orders for a project, newest first (RLS scopes to the owner). Drives the
// confirmation page's fallback lookup + the shop dashboard later (Goal 3b).
export function listOrders(userId: string, projectId: string): Promise<OrderRow[]> {
  return withUser(userId, async (db) => {
    return db.order.findMany({
      where: { projectId },
      select: ORDER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  });
}

// ---------------------------------------------------------------------------
// Shop dashboard read path (Goal 3b PR1).
//
// A shop member reads orders routed to their shop through the orders_shop_read
// SELECT policy. Crucially this path is ORDER-CENTRIC: the related project /
// project_versions rows are owned by the CUSTOMER (projects_owner_all), so they
// are invisible to a shop member on the withUser connection — we deliberately
// never `include` them here. Everything the queue needs (contact, status,
// delivery notes, timestamps) lives on the order row itself.
//
// The explicit ownerShopId filter is defence-in-depth on top of RLS: it keeps a
// multi-shop member's list deterministic and makes the query intent legible
// without relying solely on the policy (mirrors the published-only filter on
// the vehicle browse path).
// ---------------------------------------------------------------------------

export type ShopOrderRow = {
  id: string;
  ownerShopId: string;
  status: OrderStatus;
  contactName: string;
  contactEmail: string;
  createdAt: Date;
};

const SHOP_ORDER_SELECT = {
  id: true,
  ownerShopId: true,
  status: true,
  contactName: true,
  contactEmail: true,
  createdAt: true,
} satisfies Prisma.OrderSelect;

// Orders routed to any shop the caller belongs to, newest first. `shopIds` are
// the caller's membership shop ids (resolved by the route guard). RLS still
// enforces the boundary; passing an empty list short-circuits before opening a
// transaction.
export function listShopOrders(userId: string, shopIds: string[]): Promise<ShopOrderRow[]> {
  if (shopIds.length === 0) return Promise.resolve([]);
  return withUser(userId, async (db) => {
    const rows = await db.order.findMany({
      where: { ownerShopId: { in: shopIds } },
      select: SHOP_ORDER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    // ownerShopId is non-null by the `in` filter; narrow the Prisma type.
    return rows.map((r) => ({ ...r, ownerShopId: r.ownerShopId as string }));
  });
}
