-- Goal 7 review fixes F1 + F3 (PR #150 combined review).
--
-- F1: a FAILED final must not brick its concept forever. The free-final
-- farming guard previously covered finals of EVERY status, so one failed
-- final permanently blocked retrying that concept (startRun's probe + the
-- unique both fired). Recreate the partial unique to exclude failed finals:
-- the farming guard still holds — at most one non-failed (in-flight or
-- complete) final per (parent_run_id, concept_key) — but a failure can be
-- retried.
DROP INDEX "generation_runs_final_once_per_concept";

CREATE UNIQUE INDEX "generation_runs_final_once_per_concept"
  ON "generation_runs"("parent_run_id", "concept_key")
  WHERE "kind" = 'final' AND "status" <> 'failed';

-- F3: at most ONE image row per job. Two polls racing past the listImages
-- read could both harvest the same job and insert duplicate image rows; the
-- unique makes the second insert a P2002, which the harvest path treats as
-- "already imaged" (converge, don't throw).
CREATE UNIQUE INDEX "generation_images_job_once" ON "generation_images"("job_id");
