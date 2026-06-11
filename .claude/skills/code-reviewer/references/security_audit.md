# Security Audit Reference

Load this when the user wants a focused security pass — auth, secrets, injection, RLS, common web vulnerabilities. For general PR review, the security section of `review_checklist.md` is enough.

## How to do a security audit

1. **Map the attack surface first.** What inputs cross trust boundaries? Every one is a potential vector.
   - HTTP endpoints (request body, params, headers, cookies)
   - File uploads
   - URLs from search params (redirects, OAuth callbacks)
   - Webhook receivers
   - Anything pulled from a third-party API and then used unchecked
2. **For each input, ask three questions.**
   - Is it **authenticated** (do we know who is sending it)?
   - Is it **authorized** (is the sender allowed to do this)?
   - Is it **validated** (is the shape what we expect)?
3. **Follow the data.** Where does each input end up? SQL? Shell? HTML? File system? Another API? Each destination has its own escaping rules.

## Authentication

- Sessions use HTTP-only, Secure, SameSite=Lax cookies. Never store tokens in localStorage if they grant API access (XSS = total compromise).
- Password storage: bcrypt (cost ≥ 10), argon2id, or scrypt. **Never** MD5, SHA1, SHA256, or raw hashes.
- Password reset tokens: cryptographically random (`crypto.randomBytes`), one-time use, short expiry (15-60 min), invalidated after use.
- OTP / email codes: 6+ digits, max 5 attempts, expire in 5-10 min.
- Magic links: single-use, IP-bound if possible, short expiry.
- Rate limit failed login attempts per IP AND per account.

### Common auth bugs

- `auth.getSession()` in Next.js server contexts — can be spoofed via cookie tampering. Use `auth.getUser()` which validates with the auth server.
- JWTs verified with `none` algorithm — make sure your library doesn't accept this.
- JWTs with overly long expiry and no refresh — stolen token = persistent access.
- "Remember me" tokens stored in plain text in DB — breach means hijack.
- Login responses that leak whether an email exists ("user not found" vs "wrong password"). Use one generic message.

## Authorization

- Every protected endpoint checks both **authenticated** and **authorized** independently.
- IDOR (Insecure Direct Object Reference) is the #1 web app bug: `GET /api/orders/123` returns order 123 — but does it check that order 123 belongs to the logged-in user?
- Don't rely on UI hiding things. The user can call your API directly with curl.
- Admin endpoints: separate auth middleware, not "if user.role === 'admin' at the top of every handler".
- For Supabase: RLS policies on every table that holds user data. Test them with the SQL editor as `authenticated` and `anon` roles.

## Input validation

- Validate at the boundary, before any business logic, with a schema library (Zod, Yup, Pydantic, valibot).
- Validate type, shape, length, range, enum membership. "Looks like an email" is not validation; an actual schema is.
- Reject extra fields by default (Zod's `.strict()`, Pydantic's `model_config = {"extra": "forbid"}`). Stops mass assignment.
- For file uploads: server-side MIME sniffing (don't trust the extension or Content-Type header), size limit, store outside web root.

## SQL injection

- Use parameterized queries / prepared statements. Always. No exceptions.
- `WHERE x = ?` with bound param: safe. `WHERE x = '${input}'`: SQLi.
- ORMs are safe by default for the basic query builder; raw queries via the ORM still need parameters.
- LIKE patterns with user input: escape `%` and `_` or you get unexpected matches.
- For Supabase: `.eq()`, `.in()`, `.filter()` are parameterized. Raw `.rpc()` calls with user input still need to be careful inside the SQL function.

## XSS (cross-site scripting)

- React, Vue, and modern templating escape by default — usually safe.
- Danger zones: `dangerouslySetInnerHTML`, `v-html`, `innerHTML =`, `document.write`. If you must, sanitize with DOMPurify.
- URL inputs rendered as `<a href={...}>`: validate they're `http://` or `https://`, not `javascript:`.
- User-controlled CSS or style attributes can also XSS (CSS expression in old IE, but also data exfil via `background: url(...)`). Avoid.

## CSRF

- For cookie-based auth, use SameSite=Lax cookies (default in modern browsers). Add a CSRF token for state-changing operations if you need defense in depth.
- For bearer token auth (Authorization header), CSRF is not exploitable the same way — but you must not also accept the same auth via cookies.

## SSRF (server-side request forgery)

- Any endpoint that fetches a URL from user input is dangerous. The server can reach internal IPs (cloud metadata at 169.254.169.254 is the classic).
- Validate the host against an allowlist. Reject private IP ranges (`10.x`, `172.16-31.x`, `192.168.x`, `127.x`, `169.254.x`, `::1`, `fc00::/7`).
- Disable redirects, or follow them with the same validation on every hop.

## Secrets management

- Never in source code. Never in client bundles. Never in logs.
- Use `.env` files for local dev, real secret managers in production (Vercel env vars, AWS Secrets Manager, Doppler, 1Password Secrets).
- Rotate any secret that's ever been committed, even briefly. `git revert` does NOT remove it from history.
- Service account keys (`SUPABASE_SERVICE_ROLE_KEY`, AWS root keys, etc.): treat as nukes. Never in client code. Audit who has access.

## Common Next.js / Supabase security patterns

### "use client" + secrets
Anything in a `"use client"` file gets bundled into the JS sent to browsers. Secrets there = secrets leaked.

Server-only secrets: access via route handlers, server actions, or server components. Pass only the data the client needs, not the secret itself.

### Supabase RLS
- Every table that stores user data should have RLS enabled.
- Default policy: deny all. Then add specific allow policies.
- Common allow pattern: `auth.uid() = user_id` for read/write of own rows.
- For admin/system operations that need to bypass RLS, use the `service_role` key on the server only. Document why each usage needs it.
- **Test policies as different roles**: in the Supabase SQL editor, `SET ROLE authenticated; SET request.jwt.claim.sub = '...'` then run queries.

### Webhook endpoints
- Always verify the signature (Stripe, Supabase, GitHub, etc. all sign webhooks).
- Reject if the signature doesn't match or the timestamp is too old (replay protection).
- Idempotency: webhooks may be delivered multiple times. Use the event ID as a dedup key.

## Quick checklist for security review

- [ ] Every protected endpoint checks auth AND authorization
- [ ] No secrets in source, no secrets in `NEXT_PUBLIC_` vars, no service_role in client code
- [ ] All inputs validated with a schema before business logic
- [ ] All DB queries parameterized
- [ ] All external HTTP calls have timeouts
- [ ] No `dangerouslySetInnerHTML` without sanitization
- [ ] Password hashing uses bcrypt/argon2/scrypt
- [ ] Rate limits on auth, password reset, OTP, and expensive endpoints
- [ ] CORS allowlist explicit, not `*`
- [ ] Cookies are HttpOnly + Secure + SameSite=Lax
- [ ] Webhook signatures verified
- [ ] Errors don't leak stack traces / internals to clients
- [ ] Audit log for sensitive actions (admin changes, password resets, role changes)
