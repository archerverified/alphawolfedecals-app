-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('draft', 'active', 'deleted');

-- CreateEnum
CREATE TYPE "approval_state" AS ENUM ('working', 'submitted', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "asset_parse_status" AS ENUM ('pending', 'processing', 'parsed', 'failed', 'queued_missing_cli');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "owner_shop_id" UUID,
    "vehicle_id" UUID NOT NULL,
    "status" "project_status" NOT NULL DEFAULT 'draft',
    "transfer_token" TEXT,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "canvas_state" JSONB NOT NULL,
    "approval_state" "approval_state" NOT NULL DEFAULT 'working',
    "rev" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_assets" (
    "asset_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "mime_type" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "parsed_url" TEXT,
    "parse_status" "asset_parse_status" NOT NULL DEFAULT 'pending',
    "parse_metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_assets_pkey" PRIMARY KEY ("asset_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_transfer_token_key" ON "projects"("transfer_token");

-- CreateIndex
CREATE INDEX "projects_owner_user_id_status_idx" ON "projects"("owner_user_id", "status");

-- CreateIndex
CREATE INDEX "project_versions_project_id_approval_state_idx" ON "project_versions"("project_id", "approval_state");

-- CreateIndex
CREATE UNIQUE INDEX "project_versions_project_id_version_key" ON "project_versions"("project_id", "version");

-- CreateIndex
CREATE INDEX "project_assets_project_id_idx" ON "project_assets"("project_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

