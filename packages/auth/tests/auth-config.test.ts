import { describe, expect, it } from 'vitest';
import { authConfig } from '../src/auth-config';

// Goal 11 D2 regression guard. The session cookie was SameSite=strict, which
// dropped the session on the "Start design" → createProjectAction (POST) →
// editor (GET) redirect, bouncing the user to /signin (proven in auth_events:
// login → create-project → login again, seconds apart). `lax` is next-auth's
// default and the correct setting for a session cookie; this test pins it so a
// change back to strict — the exact regression — fails loudly.
describe('auth cookie SameSite', () => {
  it('session cookie is SameSite=lax (strict logs users out on POST→redirect)', () => {
    expect(authConfig.cookies?.sessionToken?.options?.sameSite).toBe('lax');
  });

  it('csrf cookie is SameSite=lax (matches next-auth default)', () => {
    expect(authConfig.cookies?.csrfToken?.options?.sameSite).toBe('lax');
  });
});
