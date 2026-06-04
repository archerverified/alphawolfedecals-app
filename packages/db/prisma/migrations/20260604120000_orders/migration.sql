-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('submitted', 'in_production', 'fulfilled', 'cancelled');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "project_version_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "owner_shop_id" UUID,
    "status" "order_status" NOT NULL DEFAULT 'submitted',
    "contact_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT,
    "delivery_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_owner_user_id_idx" ON "orders"("owner_user_id");

-- CreateIndex
CREATE INDEX "orders_owner_shop_id_status_idx" ON "orders"("owner_shop_id", "status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_project_version_id_fkey" FOREIGN KEY ("project_version_id") REFERENCES "project_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
