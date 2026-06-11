# Debugging Playbook

Load this when the user is debugging, not when they're reviewing. Maps common error signatures to causes and concrete fixes for the Next.js / Node / Python / Supabase stack.

## How to use this file

1. Get the **exact error** from the user — full message, stack trace if any. Don't guess from a paraphrase.
2. Find the closest match in the sections below.
3. Form a hypothesis. Verify by reading the actual code.
4. Propose a specific fix. Not "try X" — "change line N from A to B because Y".
5. If it's a bigger issue (architectural, requires real refactor), recommend the right skill: `senior-frontend`, `senior-backend`, `senior-architect`, `webapp-testing`.

If no match here, fall back to first principles: read the error, read the code, follow the stack frames, isolate the failing case with print/console.log debugging if needed.

---

## Next.js errors

### "Hydration failed because the initial UI does not match what was rendered on the server"

**Cause:** The server-rendered HTML differs from what React renders on the client. Common sources:
- `Math.random()`, `Date.now()`, or `new Date()` used during render
- `typeof window` checks producing different output server vs client
- Browser-only APIs read during render (`localStorage`, `window.matchMedia`)
- Different time zones (server in UTC, client in local time)
- Date formatting with `Intl.DateTimeFormat` without explicit locale
- Conditional rendering based on `useState`'s initial value that depends on client-only state

**Fix:** Move the differing logic into `useEffect` (runs only on client) or use `useSyncExternalStore`. For locale-sensitive formatting, pass a fixed locale.

For Next.js 14+: wrap the client-only part in a component that uses `dynamic(() => import(...), { ssr: false })` if it must run client-only.

### "Module not found: Can't resolve 'fs'" (or 'crypto', 'net', etc.)

**Cause:** A Node-only module is being imported in code that runs in the browser or edge runtime. Usually because:
- A `"use client"` file imports a server-only package
- A shared utility file uses `fs` and gets imported by both server and client code
- Edge runtime route imports a Node-only package

**Fix:** Move the import to a server-only file. Or use the `server-only` package to enforce: `import 'server-only'` at the top of files that must not be bundled into the client.

### "Error: Event handlers cannot be passed to Client Component props"

**Cause:** A server component is passing a function (event handler) to a client component as a prop. Functions aren't serializable across the server/client boundary.

**Fix:** Convert the function into a server action (`"use server"`) or move the handler creation into the client component itself.

### "Cookies/headers can only be called in a Server Component, Server Action, or Route Handler"

**Cause:** Trying to use `next/headers` (cookies, headers) inside a client component.

**Fix:** Read the cookies/headers in a parent server component and pass the needed values down as props. Or use a server action for actions that need them.

### Stale data after a mutation

**Cause:** Next.js is caching the page. After mutation, you need to invalidate.

**Fix:** Call `revalidatePath('/path')` or `revalidateTag('tag')` from your server action / route handler after the mutation. For fetch-level caching, use `{ next: { tags: [...] } }` and tag-based invalidation.

### `process.env.X` is undefined in client component

**Cause:** Only `NEXT_PUBLIC_*` env vars are exposed to the client.

**Fix:** Either rename to `NEXT_PUBLIC_X` if it's safe to expose, or move the logic to a server component / route handler / server action.

---

## TypeScript / Build errors

### "Cannot find module 'X' or its corresponding type declarations"

**Cause:** Either the package isn't installed, or it doesn't ship types and you need `@types/X`.

**Fix:** `npm install X` if missing. `npm install --save-dev @types/X` if it's a CJS package without bundled types. If `@types/X` doesn't exist, add a `.d.ts` declaration: `declare module 'X';`.

### "Property 'X' does not exist on type 'Y'"

**Cause:** The type doesn't have that property, but the runtime value does. Possible reasons:
- The type is too narrow (you cast/declared it wrong upstream)
- The property comes from an extension or a dynamic key
- You're accessing the wrong variable

**Fix:** Don't reach for `as any`. Figure out where the type was defined and either fix the definition, narrow with a type guard, or use a discriminated union.

### "Type 'undefined' is not assignable to type 'X'"

**Cause:** TypeScript can't prove the value isn't undefined.

**Fix:** Add a guard (`if (value !== undefined)`), use optional chaining, or provide a default with `??`. Avoid `!` non-null assertion unless you're certain — it bypasses the check.

### "ERR_REQUIRE_ESM" / "Cannot use import statement outside a module"

**Cause:** Mixing CommonJS and ES modules. Modern packages are increasingly ESM-only.

**Fix:** Set `"type": "module"` in package.json, or use dynamic `import()` if you must stay on CJS. For Next.js, this is usually automatic. For raw Node, the easiest path forward is "go full ESM."

---

## Node.js runtime errors

### "EADDRINUSE: address already in use"

**Cause:** Another process is using the port (often a previous instance of your app that didn't clean up).

**Fix:** Find the process: `lsof -i :3000` (Mac/Linux) or `netstat -ano | findstr :3000` (Windows). Kill it. Or change ports.

### "ECONNREFUSED" connecting to localhost service

**Cause:** The target service isn't running, or it's bound to a different interface, or in Docker the hostname is wrong (`localhost` inside a container ≠ host machine).

**Fix:** Verify the service is up (`curl http://localhost:5432` or whatever). In Docker, use `host.docker.internal` or the service name from docker-compose.

### "UnhandledPromiseRejection" / process crashes

**Cause:** A promise rejected and nothing caught it.

**Fix:** Add `.catch()` or wrap in try/await. Read the stack trace to find the source. Set up a global handler `process.on('unhandledRejection', ...)` as a safety net — but treat any hit as a bug to fix at the source.

### "Maximum call stack size exceeded"

**Cause:** Infinite recursion. Often a render loop in React or a getter that calls itself.

**Fix:** Read the stack trace — the repeated frame names tell you which function is recursing. Look for missing base cases, accidental self-references in object getters, or React state updates triggering re-renders that update the same state.

### Memory leak (process memory grows over time)

**Common causes:**
- Event listeners added without removal
- Timers (setInterval) not cleared
- Caches (Map, object) with no eviction
- Closures retaining large objects
- Large request/response bodies buffered in memory

**Fix:** Profile with `node --inspect` and Chrome DevTools' Memory tab. Take heap snapshots before and after a known leak-inducing operation; diff them.

---

## Supabase errors

### "new row violates row-level security policy"

**Cause:** The user's JWT doesn't pass the RLS policy for INSERT.

**Fix:** Check the policy's `WITH CHECK` clause. Common bug: the policy expects `user_id = auth.uid()` but the client isn't setting `user_id` on the insert.

If you're calling from a server with the user's auth context, make sure the supabase client is created with the user's JWT, not the anon key alone.

### "JWT expired" / "Invalid JWT"

**Cause:** The user's access token expired (default 1 hour) and wasn't refreshed.

**Fix:** Use `supabase.auth.getSession()` only on the client (it auto-refreshes). On the server, use `supabase.auth.getUser()` which validates with the auth server. For long-running server processes, store the refresh token and call `supabase.auth.refreshSession({ refresh_token })`.

### `supabase.auth.getUser()` returns null when user should be authenticated

**Cause:** The supabase client was created without the auth context (e.g., using just `createClient(url, anon_key)` in a server component without cookies).

**Fix:** Use the helper for your framework. For Next.js App Router, use `@supabase/ssr` and `createServerClient` with `cookies()` from `next/headers`.

### Realtime subscription fires but my UI doesn't update

**Cause:**
- Subscription returns rows that don't pass RLS — you're getting silent filtering
- The state update is on a stale closure
- Multiple subscriptions stacking up because cleanup isn't happening

**Fix:** Log inside the subscription callback to verify what's coming through. Make sure `useEffect` returns a cleanup that calls `channel.unsubscribe()` or `supabase.removeChannel(channel)`.

### Storage upload "InvalidKey" or "AccessDenied"

**Cause:** Either the bucket doesn't exist, the user doesn't have permission (bucket policy), or the path is malformed (no leading slash, no special chars).

**Fix:** Verify bucket exists. Check bucket-level policies in the Supabase dashboard. Sanitize the path: `${userId}/${crypto.randomUUID()}.${ext}`.

---

## Python errors

### "ModuleNotFoundError: No module named 'X'"

**Cause:** Either the package isn't installed in the active environment, or you're running with the wrong Python.

**Fix:** Check which python is active: `which python` (should be your venv). Install: `pip install X`. If using uv/poetry, add to the project.

### "ImportError: cannot import name 'X' from 'Y'"

**Cause:** Either Y doesn't have X, X is misspelled, or there's a circular import.

**Fix:** Check the package version (`pip show Y`); the API may have changed. For circular imports, move the import inside the function that uses it.

### "RuntimeError: This event loop is already running"

**Cause:** Calling `asyncio.run()` from inside an already-running event loop (e.g., inside FastAPI or Jupyter).

**Fix:** Use `await` directly if you're inside an async function. In Jupyter, use `nest_asyncio` or just `await` at the top level.

### "TypeError: object of type 'NoneType' has no attribute 'X'"

**Cause:** A function returned `None` when you expected an object (often a DB query that found no rows).

**Fix:** Check the return value before using it. For Supabase / SQLAlchemy: handle the empty-result case.

### Pydantic validation error in production

**Cause:** Real-world input doesn't match your model. Optional fields, type coercion edge cases, extra fields, etc.

**Fix:** Look at the exact validation error — it tells you which field failed and why. Either fix the input source or relax the model (carefully — relaxing validation often hides bugs).

---

## When to recommend handing off

Some bugs aren't "fix this line" — they're "this whole approach is wrong." Recognize these and suggest the right skill:

| Symptom | Suggest |
|---|---|
| "I keep adding state and it's getting tangled" → state management redesign | `senior-frontend` |
| "The DB query is slow even with the index" → schema or query rewrite | `senior-backend` |
| "I want to add X but the architecture doesn't support it" | `senior-architect` |
| "I can't reproduce this bug" / "Need to write tests" | `webapp-testing` |
| "Emails are landing in spam" / "DMARC fails" | `email-systems` |
| "I need to plan a new feature from scratch" | `app-prd` |

Frame the handoff as a recommendation, not a deflection: "This is more than a debug — the way state flows through these components needs a rethink. Worth pulling in `senior-frontend`. Want me to switch?"
