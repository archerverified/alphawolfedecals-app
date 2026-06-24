// Shop print-profile repository (Goal 22 / D1). One profile per shop; reads and
// writes run under withUser so the shop_print_profiles RLS policies
// (app_is_shop_member) enforce that only a member of the shop can see or change
// it. The app layer validates numeric ranges before calling; the DB CHECK
// constraints are the belt-and-braces never-short guard (effective <= nominal,
// overlap < effective, all positive).

import { withUser, type TxClient } from '../client.js';

export interface ShopPrintProfileRow {
  shopId: string;
  printerKey: string | null;
  printerLabel: string | null;
  nominalWidthIn: number;
  effectiveWidthIn: number;
  defaultOverlapIn: number;
  bleedIn: number;
  mediaType: string | null;
  updatedAt: Date;
}

export interface UpsertShopPrintProfileInput {
  printerKey?: string | null;
  printerLabel?: string | null;
  nominalWidthIn: number;
  effectiveWidthIn: number;
  defaultOverlapIn: number;
  bleedIn: number;
  mediaType?: string | null;
}

type ProfileRecord = {
  shopId: string;
  printerKey: string | null;
  printerLabel: string | null;
  nominalWidthIn: unknown;
  effectiveWidthIn: unknown;
  defaultOverlapIn: unknown;
  bleedIn: unknown;
  mediaType: string | null;
  updatedAt: Date;
};

// Prisma returns Decimal columns as Decimal objects; coerce to plain numbers at
// the repo boundary so the engine works in primitives.
function toRow(p: ProfileRecord): ShopPrintProfileRow {
  return {
    shopId: p.shopId,
    printerKey: p.printerKey,
    printerLabel: p.printerLabel,
    nominalWidthIn: Number(p.nominalWidthIn),
    effectiveWidthIn: Number(p.effectiveWidthIn),
    defaultOverlapIn: Number(p.defaultOverlapIn),
    bleedIn: Number(p.bleedIn),
    mediaType: p.mediaType,
    updatedAt: p.updatedAt,
  };
}

const SELECT = {
  shopId: true,
  printerKey: true,
  printerLabel: true,
  nominalWidthIn: true,
  effectiveWidthIn: true,
  defaultOverlapIn: true,
  bleedIn: true,
  mediaType: true,
  updatedAt: true,
} as const;

export async function getShopPrintProfile(
  userId: string,
  shopId: string,
): Promise<ShopPrintProfileRow | null> {
  return withUser(userId, async (db: TxClient) => {
    const p = await db.shopPrintProfile.findUnique({ where: { shopId }, select: SELECT });
    return p ? toRow(p as ProfileRecord) : null;
  });
}

export async function upsertShopPrintProfile(
  userId: string,
  shopId: string,
  input: UpsertShopPrintProfileInput,
): Promise<ShopPrintProfileRow> {
  const data = {
    printerKey: input.printerKey ?? null,
    printerLabel: input.printerLabel ?? null,
    nominalWidthIn: input.nominalWidthIn,
    effectiveWidthIn: input.effectiveWidthIn,
    defaultOverlapIn: input.defaultOverlapIn,
    bleedIn: input.bleedIn,
    mediaType: input.mediaType ?? null,
  };
  return withUser(userId, async (db: TxClient) => {
    const p = await db.shopPrintProfile.upsert({
      where: { shopId },
      create: { shopId, ...data },
      update: { ...data, updatedAt: new Date() },
      select: SELECT,
    });
    return toRow(p as ProfileRecord);
  });
}
