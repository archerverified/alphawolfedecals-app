// Remove an E2E throwaway customer and EVERYTHING it created from the live
// database (Goal 7 repo rule: local e2e runs against the real DB must leave
// no visible test artifacts). Usage:
//
//   pnpm --filter @alphawolf/db db:cleanup-e2e <email> [<email> ...]
//
// Safety rails:
//   * Refuses any email that is not @e2e.alphawolf.test — this is a deletion
//     tool for synthetic e2e identities ONLY, never a real customer.
//   * withSystem is the legitimate use here (system maintenance, no user
//     session) — same doctrine as the sweeper.
//
// Deletion order: project rows cascade versions/assets/briefs/generation
// runs/jobs/images at the DB level; users cascade credit_ledger/otp/auth
// events. Projects do NOT cascade from users (deliberate, see schema note),
// so they're deleted explicitly first. Storage objects (uploads + generated
// renders) are removed best-effort afterwards.

import { withSystem } from '../src/client.js';
import { removeAssetObject } from '../src/storage/supabase.js';
import { findUserByEmailForAuth } from '../src/repos/users.js';

const ALLOWED_SUFFIX = '@e2e.alphawolf.test';

async function cleanupOne(email: string): Promise<void> {
  if (!email.endsWith(ALLOWED_SUFFIX)) {
    console.error(`SKIP ${email}: only ${ALLOWED_SUFFIX} identities can be cleaned up.`);
    return;
  }
  const user = await findUserByEmailForAuth(email);
  if (!user) {
    console.log(`SKIP ${email}: no such user.`);
    return;
  }

  const { storagePaths, projectCount } = await withSystem(async (db) => {
    const projects = await db.project.findMany({
      where: { ownerUserId: user.id },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);

    // Collect storage keys BEFORE the cascade wipes the rows.
    const assets = await db.projectAsset.findMany({
      where: { projectId: { in: projectIds } },
      select: { sourceUrl: true, parsedUrl: true },
    });
    const genImages = await db.generationImage.findMany({
      where: { run: { projectId: { in: projectIds } } },
      select: { storagePath: true, previewPath: true },
    });
    const paths = new Set<string>();
    for (const a of assets) {
      if (a.sourceUrl) paths.add(a.sourceUrl);
      if (a.parsedUrl) paths.add(a.parsedUrl);
    }
    for (const g of genImages) {
      paths.add(g.storagePath);
      if (g.previewPath) paths.add(g.previewPath);
    }

    // Projects cascade versions/assets/briefs/runs/jobs/images.
    await db.project.deleteMany({ where: { ownerUserId: user.id } });
    // User cascades credit_ledger, otp codes, auth events, memberships.
    await db.user.delete({ where: { id: user.id } });

    return { storagePaths: [...paths], projectCount: projectIds.length };
  });

  let removed = 0;
  for (const path of storagePaths) {
    try {
      await removeAssetObject(path);
      removed += 1;
    } catch {
      // Best-effort: a missing object or unconfigured storage never fails the cleanup.
    }
  }

  console.log(
    `CLEANED ${email}: ${projectCount} project(s), user row, and ` +
      `${removed}/${storagePaths.length} storage object(s) removed.`,
  );
}

async function main(): Promise<void> {
  const emails = process.argv.slice(2).filter(Boolean);
  if (emails.length === 0) {
    console.error('Usage: pnpm --filter @alphawolf/db db:cleanup-e2e <email> [<email> ...]');
    process.exitCode = 1;
    return;
  }
  for (const email of emails) {
    await cleanupOne(email);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
