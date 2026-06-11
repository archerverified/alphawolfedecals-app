# Stack-Specific Antipatterns

The footguns the scanner can't catch with regex — things you only see by reading the code and knowing the stack. Organized by stack so you can jump to the relevant section.

## Table of contents

- [Next.js (App Router)](#nextjs-app-router)
- [TypeScript / React](#typescript--react)
- [Node.js](#nodejs)
- [Python](#python)
- [Supabase](#supabase)
- [PostgreSQL](#postgresql)

---

## Next.js (App Router)

### Server / client boundary confusion

The single biggest source of Next.js App Router bugs. Rules:

- Server components (default) run only on the server. They can be async, can read files, can use server-only env vars.
- Client components (`"use client"` at top) run on both server (initial render) and client (hydration + interactivity). They CANNOT be async at the top level. Their props must be serializable.
- **A client component can render a server component as a child only if it's passed in as a prop or children**, not imported and rendered directly.

Common bugs:
- `useState` in a server component → build error.
- Importing a server-only module (like `next/headers`) in a client component → cryptic error at build or runtime.
- Passing a function as a prop from server → client → that function is not serializable. Use server actions instead.
- Reading cookies in a server component, then conditionally rendering — fine, but the result is cached per-request, not reactive on the client.

### `fetch` and caching

Next.js patches `fetch` with caching behavior. Default in Next 15+ is `no-store`; was `force-cache` in earlier versions. Be explicit:

```ts
fetch(url, { cache: 'no-store' })           // always fresh
fetch(url, { next: { revalidate: 60 } })    // ISR — refresh every 60s
fetch(url, { next: { tags: ['posts'] } })   // tag-based invalidation
```

Calling third-party APIs without thinking about caching is how you get inexplicably stale data or get rate-limited because you cached an error response.

### Server actions

- Server actions must be in files with `"use server"` directive (or inside server components).
- They're called as POST requests with a special encoding. Network errors look like generic action failures, not HTTP errors.
- They're public endpoints — validate inputs and check auth inside the action, not just in the calling UI.

### Middleware

- Runs on every request matched by the matcher config. Keep it fast (target: < 50ms).
- No DB queries in middleware unless you're caching aggressively.
- Edge runtime: no Node APIs (`fs`, `crypto.createHash`, etc.). Use Web Crypto API.

### Image and Link

- `<img>` instead of `<Image>` from `next/image` → no auto-optimization, worse LCP.
- `<a href="/about">` instead of `<Link>` from `next/link` → full page reload, no prefetch.

### Environment variables

- `NEXT_PUBLIC_*` → bundled into client JS. Public. Permanent. Never put secrets here.
- All other env vars → server-only. Will be `undefined` in client components.
- A client component that tries to use a non-`NEXT_PUBLIC_` var won't error, it'll just silently be undefined. Look for this.

---

## TypeScript / React

### State management

- Lifting state too high or too low. State should live at the lowest common ancestor of components that need it.
- Putting derived state in `useState` + `useEffect` to sync — usually wrong. Compute it during render or use `useMemo`.
- Storing the same data in multiple places (URL, local state, server state, localStorage) without a single source of truth — gets out of sync, hard to debug.

### useEffect smells

- Empty deps array `[]` with stale closure — the effect captures the first render's values.
- Missing deps — React's lint rule (`exhaustive-deps`) catches most of these. If suppressed with a comment, the comment should explain why.
- Doing data fetching in `useEffect` for data the page needs to render — better as a server component (App Router) or with React Query / SWR.
- Setting state in `useEffect` based on props — that's derived state, compute it in render.

### Performance traps

- New object/array literal as a prop on every render: `<Component config={{x: 1}} />` — breaks memo and reference equality. Hoist or `useMemo`.
- New function as a prop without `useCallback` when the child is memo'd.
- Large lists without virtualization (>200 items roughly). Use `react-window` or `react-virtuoso`.

### Type modeling

- `any` is contagious. One `any` ruins type checking for everything downstream. Use `unknown` and narrow.
- Optional chaining hides type problems: `user?.name ?? 'guest'` is fine, but `user!.name` is just an assertion that breaks at runtime.
- Discriminated unions > overloaded objects: `type Action = { type: 'set'; value: string } | { type: 'clear' }` is much better than `{ type: string; value?: string }`.
- `Partial<T>` everywhere usually means the underlying type is wrong. Real APIs return real shapes; model the actual response.

---

## Node.js

### Async patterns

- Mixing callbacks, promises, and `async/await` in the same flow — confusing and error-prone. Pick one.
- `forEach` with async callbacks — `forEach` doesn't wait for promises. Use `for...of` or `Promise.all(arr.map(...))`.
- `Promise.all` with side-effecting work — if one fails, others may have already mutated state. Consider `Promise.allSettled` for fault tolerance.
- Unhandled promise rejections — in modern Node, they crash the process by default. Always have a `.catch` or wrap in try/await.

### File system & paths

- `path.join` vs string concatenation. Always `path.join` or `path.resolve`.
- User-controlled paths → path traversal (`../../../etc/passwd`). Validate, or use `path.resolve` and check the result is inside an allowed base directory.
- Synchronous fs operations in request handlers (`fs.readFileSync`) — blocks the event loop. Use async versions.

### Streams & buffers

- Forgetting backpressure on stream pipelines — memory grows unbounded. Use `stream.pipeline()` or `pipeline()` from `stream/promises`, not `.pipe()` chains.
- Buffer concat in a loop — O(n²) memory copies. Collect chunks in an array and concat once at end, or use a stream.

### Express / Fastify patterns

- Forgetting `next(err)` in error-handling middleware — error never propagates.
- Sending the response twice — check for `res.headersSent` before writing.
- Long-running handlers blocking the event loop — offload to workers or a queue.
- Not setting body size limits → DoS via huge JSON bodies. Set `limit: '1mb'` or similar.

---

## Python

### Mutable default arguments

```python
def add_item(item, list=[]):  # WRONG — list is shared across calls
    list.append(item)
    return list
```

Use `None` and initialize inside:

```python
def add_item(item, list=None):
    if list is None:
        list = []
    list.append(item)
    return list
```

### Exception handling

- Bare `except:` catches `SystemExit` and `KeyboardInterrupt`, making the program impossible to kill cleanly.
- `except Exception: pass` — log it at minimum. Silent failures are debug hell.
- Catching `Exception` and re-raising as a generic error loses the traceback. Use `raise NewError(...) from original_error`.

### Type hints

- Adding `Optional[X]` everywhere defeats the purpose. If something is never None at runtime, type it as `X`.
- `List`, `Dict`, etc. from `typing` are deprecated for new code (Python 3.9+) — use `list`, `dict` directly.
- `Any` type — same as TypeScript's `any`. Avoid.

### Async / sync mixing

- Calling sync code (like `requests.get`) from async functions blocks the event loop. Use `httpx.AsyncClient` or `aiohttp`.
- `asyncio.run()` inside an existing event loop → error. Use `await` or run in executor.

### Common library footguns

- `requests` without `timeout=` → hangs forever on bad network.
- `subprocess` with `shell=True` and user input → shell injection.
- `pickle.load()` on untrusted data → arbitrary code execution. Use JSON or msgpack.
- `datetime.now()` returns naive datetime by default. Use `datetime.now(timezone.utc)` for anything stored or compared.

---

## Supabase

### The service_role key

- Bypasses ALL Row Level Security. Treat it like a database superuser password.
- Only use it in server-side code: route handlers, server actions, edge functions, backend scripts.
- **NEVER** in a `"use client"` file. **NEVER** in a `NEXT_PUBLIC_` env var.
- When you do use it, comment why this operation needs RLS bypass.

### RLS policies

- Enable RLS on every table that holds user data. Default to deny-all, then add explicit allow policies.
- Common pattern for "users own their own rows":
  ```sql
  CREATE POLICY "users can read own" ON table_name FOR SELECT
    USING (auth.uid() = user_id);
  CREATE POLICY "users can insert own" ON table_name FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  ```
- Test policies by setting role and JWT claims in the SQL editor.
- Policies on JOINs: the policy is checked against the rows being returned, not the joined-against table. Don't assume joining to a "permissions" table enforces anything by itself.

### Auth

- Use `auth.getUser()` in server contexts, not `auth.getSession()`. `getSession` reads from cookies which can be tampered with.
- After signup, the user may or may not be confirmed depending on email confirmation settings. Check `user.email_confirmed_at` before treating the account as "real".
- `signOut()` only clears the local session. For "log out everywhere" you need to revoke refresh tokens on the server side via the admin API.

### Queries

- `.select('*')` returns every column, including sensitive ones you may have added later. Be explicit.
- `.single()` throws if 0 or >1 rows match. Use `.maybeSingle()` if 0 rows is expected.
- Cascading `.eq()`s chain with AND. Use `.or()` for OR.
- Realtime subscriptions need to be unsubscribed in component cleanup — otherwise you accumulate channels and trigger duplicate handlers.

### Storage

- Default bucket is private. Public buckets are publicly readable; anything sensitive should not go there.
- Signed URLs have an expiry. Pick the shortest one that works for the use case. A 1-year signed URL is functionally public.
- Validate file types and sizes server-side before storing. Don't trust client-side validation.

---

## PostgreSQL

### Schema design

- Use `text` over `varchar(n)` unless you have a real reason for the length limit. Postgres `text` is as efficient and avoids "field too long" errors at app boundaries.
- Use `timestamptz` (timestamp with time zone), never `timestamp` (without). Always store in UTC.
- Use `uuid` for IDs unless you need orderability. For ordering use `bigint` with a sequence.
- Foreign keys with `ON DELETE` clauses considered explicitly — `RESTRICT` (default), `CASCADE`, `SET NULL`. Each has consequences.

### Migrations

- Adding a NOT NULL column to a large table locks the table. Add as nullable, backfill, then ALTER to NOT NULL.
- Adding an index on a large table: use `CREATE INDEX CONCURRENTLY` to avoid locking.
- Dropping a column is irreversible. Soft-deprecate first (mark as deprecated, stop writing, monitor, then drop after weeks).

### Query performance

- Use `EXPLAIN ANALYZE` on slow queries to see the actual plan.
- Sequential scan on a large table → you're probably missing an index.
- `SELECT *` in production code → returns more data than needed, breaks when columns are added.
- `OFFSET 10000` in pagination → Postgres still scans all 10000 rows. Use cursor-based pagination instead.
