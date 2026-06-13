-- CreateTable
CREATE TABLE "concept_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "concept_key" TEXT NOT NULL,
    "voter_token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concept_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One vote per visitor per project; the visitor can move their 👍 between
-- concepts (UPDATE), but never stack ballots.
CREATE UNIQUE INDEX "concept_votes_project_id_voter_token_key" ON "concept_votes"("project_id", "voter_token");

-- CreateIndex
CREATE INDEX "concept_votes_project_id_idx" ON "concept_votes"("project_id");

-- AddForeignKey
ALTER TABLE "concept_votes" ADD CONSTRAINT "concept_votes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
