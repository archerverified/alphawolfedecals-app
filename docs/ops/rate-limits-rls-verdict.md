# `rate_limits` RLS-disabled advisory — verdict (Goal 9.1 D5)

_Decided 2026-06-14. Supabase security advisory: `public.rate_limits` (and
`public._prisma_migrations`) have Row Level Security disabled — "anyone with the
anon key can read or modify every row."_

## The deciding question: does the Supabase anon/publishable key reach the browser?

**No.** Verified by code audit of `apps/web` + `packages/db`:

- **No `NEXT_PUBLIC_SUPABASE_ANON_KEY` anywhere.** The only `NEXT_PUBLIC_SUPABASE_*`
  reference is `NEXT_PUBLIC_SUPABASE_URL`, used solely as a server-side fallback for
  the storage **base URL** (`packages/db/src/storage/supabase.ts`,
  `apps/web/lib/export/load-spec-pack-data.ts`). A project URL is not a secret.
- **No browser Supabase client.** No `createBrowserClient`, `@supabase/ssr`, or
  `@supabase/auth-helpers` in the app. The only `createClient` is the **service-role
  server** client in `storage/supabase.ts` (server-only, used for Storage).
- **All DB access is server-side Prisma** via the two-connection split
  (`withUser` = app_user/RLS, `withSystem` = superuser). The app uses **custom auth**
  (the `app.current_user_id` GUC), NOT Supabase Auth, so PostgREST + the anon key are
  not part of any request path. `rate_limits` specifically is touched **only** via
  `withSystem` (`packages/db/src/repos/rate-limit.ts`).

## Verdict: defense-in-depth, NOT a live exploit path → deferred to Goal 10

Because the anon key is never published to a client, there is no anon-key-bearing
caller who could hit PostgREST to read/modify `rate_limits`. The advisory is real as
"RLS is off" but the exploit it describes requires a client-exposed anon key, which
this architecture does not have. It is therefore **defense-in-depth**, and is part of
the accepted 2-WARN advisory baseline — **no live rate-limit-bypass hole.**

Per the Goal 9.1 decision policy, this is **documented and handed to Goal 10** rather
than changed now. We deliberately did NOT blindly `ALTER TABLE ... ENABLE ROW LEVEL
SECURITY` (the advisory warns this can lock a table to zero rows).

### Ready-made fix for Goal 10 (safe here, unlike the generic warning)

`rate_limits` and `_prisma_migrations` are accessed **only** by the superuser
(`withSystem` / Prisma migrate over `DIRECT_URL`), and the superuser **bypasses RLS**.
So enabling RLS — even with no policy (deny-all to `anon`/`authenticated`) — would
close the PostgREST vector **without breaking the app**. Goal 10 should:

```sql
ALTER TABLE public.rate_limits        ENABLE ROW LEVEL SECURITY; -- deny-all to anon/authenticated;
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY; -- withSystem/migrate (superuser) bypasses RLS
```

…and confirm via the advisor + a smoke that auth/rate-limited paths still work, with
the §3 second security review (it touches the DB split). Tracked as a Goal 10 item.
