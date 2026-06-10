-- Goal 5 / B2C-002 — design brief + versioned snapshots.
-- RLS (owner-only via project ownership) lives in prisma/sql/auth_rls.sql.

-- CreateTable
CREATE TABLE "design_briefs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "rev" INTEGER NOT NULL DEFAULT 0,
    "current_step" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brief_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "brief_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brief_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "design_briefs_project_id_key" ON "design_briefs"("project_id");

-- CreateIndex
CREATE INDEX "design_briefs_owner_user_id_idx" ON "design_briefs"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "brief_snapshots_brief_id_version_key" ON "brief_snapshots"("brief_id", "version");

-- AddForeignKey
ALTER TABLE "design_briefs" ADD CONSTRAINT "design_briefs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_snapshots" ADD CONSTRAINT "brief_snapshots_brief_id_fkey" FOREIGN KEY ("brief_id") REFERENCES "design_briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
