// Vehicle template request repository (GH-017).
//
// A signed-in user files a request for a vehicle that isn't in the library yet;
// admins work the queue and, on "shipped", the web layer emails the requester a
// deep link to the new template. RLS (see prisma/sql/auth_rls.sql):
//   * requester sees only their own requests; admins see all
//   * a user may only insert a request as themselves (requester_id = self)
//   * status transitions are admin-only
// So creates/own-reads run on withUser(userId) and the admin queue runs on
// withUser(adminId). Never expose the Prisma client.

import { withUser } from '../client';

// pending -> in_progress -> shipped | rejected. Stored as text per spec §2.
export const REQUEST_STATUSES = ['pending', 'in_progress', 'shipped', 'rejected'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export function isRequestStatus(value: string): value is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(value);
}

export type TemplateRequest = {
  id: string;
  requesterId: string | null;
  requesterEmail: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  variant: string | null;
  referencePhotoUrls: string[];
  notes: string | null;
  status: string;
  shippedVehicleId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

export type CreateRequestInput = {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  variant?: string | null;
  notes?: string | null;
  referencePhotoUrls?: string[];
  // When false the requester opts OUT of the ship notification — we then store
  // no email, so no follow-up can be sent (GH-017 email opt-out).
  notifyByEmail: boolean;
  // The requester's email, used only when notifyByEmail is true.
  email?: string | null;
};

export async function createRequest(
  userId: string,
  input: CreateRequestInput,
): Promise<TemplateRequest> {
  return withUser(userId, async (db) => {
    const row = await db.vehicleTemplateRequest.create({
      data: {
        requesterId: userId,
        requesterEmail: input.notifyByEmail ? (input.email ?? null) : null,
        year: input.year,
        make: input.make,
        model: input.model,
        trim: input.trim ?? null,
        variant: input.variant ?? null,
        notes: input.notes ?? null,
        referencePhotoUrls: input.referencePhotoUrls ?? [],
        status: 'pending',
      },
    });
    return toRequest(row);
  });
}

export async function listOwnRequests(userId: string): Promise<TemplateRequest[]> {
  return withUser(userId, async (db) => {
    const rows = await db.vehicleTemplateRequest.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRequest);
  });
}

export async function adminListRequests(
  adminId: string,
  status?: RequestStatus,
): Promise<TemplateRequest[]> {
  return withUser(adminId, async (db) => {
    const rows = await db.vehicleTemplateRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
    });
    return rows.map(toRequest);
  });
}

export async function adminGetRequest(
  adminId: string,
  id: string,
): Promise<TemplateRequest | null> {
  return withUser(adminId, async (db) => {
    const row = await db.vehicleTemplateRequest.findUnique({ where: { id } });
    return row ? toRequest(row) : null;
  });
}

// Transition a request's status. Sets resolved_at + the shipped vehicle link for
// terminal states. Returns the updated request so the caller can email the
// requester on "shipped" (GH-017). RLS rejects this for non-admins.
export async function adminUpdateStatus(
  adminId: string,
  id: string,
  status: RequestStatus,
  shippedVehicleId?: string | null,
): Promise<TemplateRequest> {
  return withUser(adminId, async (db) => {
    const terminal = status === 'shipped' || status === 'rejected';
    const row = await db.vehicleTemplateRequest.update({
      where: { id },
      data: {
        status,
        shippedVehicleId: status === 'shipped' ? (shippedVehicleId ?? null) : null,
        resolvedAt: terminal ? new Date() : null,
      },
    });
    return toRequest(row);
  });
}

type RequestRow = {
  id: string;
  requesterId: string | null;
  requesterEmail: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  variant: string | null;
  referencePhotoUrls: string[];
  notes: string | null;
  status: string;
  shippedVehicleId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

function toRequest(row: RequestRow): TemplateRequest {
  return {
    id: row.id,
    requesterId: row.requesterId,
    requesterEmail: row.requesterEmail,
    year: row.year,
    make: row.make,
    model: row.model,
    trim: row.trim,
    variant: row.variant,
    referencePhotoUrls: row.referencePhotoUrls,
    notes: row.notes,
    status: row.status,
    shippedVehicleId: row.shippedVehicleId,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}
