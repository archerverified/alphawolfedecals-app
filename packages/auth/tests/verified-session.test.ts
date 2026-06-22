import { beforeEach, describe, expect, it, vi } from 'vitest';

// authorizeVerifiedSession is the authorize() body of the `otp-verified`
// Credentials provider: it turns a freshly-minted verification ticket into the
// session user, WITHOUT a password. These tests pin that it only ever signs in
// the exact, currently-active account the ticket was minted for.

type StoredUser = {
  id: string;
  email: string;
  accountType: 'customer' | 'shop_user';
  status: 'pending_verification' | 'active' | 'locked' | 'deleted';
};

const users = new Map<string, StoredUser>();

vi.mock('@alphawolf/db', () => ({
  users: {
    async findUserById(id: string) {
      return users.get(id) ?? null;
    },
  },
}));

import { authorizeVerifiedSession } from '../src/verified-session';
import { issueVerificationTicket } from '../src/verification-ticket';

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  users.clear();
  users.set('u-1', {
    id: 'u-1',
    email: 'casey@example.com',
    accountType: 'customer',
    status: 'active',
  });
  users.set('shop-1', {
    id: 'shop-1',
    email: 'shop@example.com',
    accountType: 'shop_user',
    status: 'active',
  });
});

describe('authorizeVerifiedSession', () => {
  it('signs in the active customer the ticket was minted for', async () => {
    const ticket = issueVerificationTicket('u-1', 'casey@example.com');
    expect(await authorizeVerifiedSession('casey@example.com', ticket)).toEqual({
      id: 'u-1',
      email: 'casey@example.com',
      accountType: 'customer',
    });
  });

  it('signs in a shop account (last_login + dashboard reachable after verify)', async () => {
    const ticket = issueVerificationTicket('shop-1', 'shop@example.com');
    const res = await authorizeVerifiedSession('shop@example.com', ticket);
    expect(res?.accountType).toBe('shop_user');
  });

  it('rejects a forged / invalid ticket', async () => {
    expect(await authorizeVerifiedSession('casey@example.com', 'forged.ticket')).toBeNull();
  });

  it('rejects when the submitted email does not match the ticket', async () => {
    const ticket = issueVerificationTicket('u-1', 'casey@example.com');
    expect(await authorizeVerifiedSession('mallory@example.com', ticket)).toBeNull();
  });

  it('rejects a not-yet-active account', async () => {
    users.set('u-1', { ...users.get('u-1')!, status: 'pending_verification' });
    const ticket = issueVerificationTicket('u-1', 'casey@example.com');
    expect(await authorizeVerifiedSession('casey@example.com', ticket)).toBeNull();
  });

  it('rejects when the user no longer exists', async () => {
    const ticket = issueVerificationTicket('ghost', 'ghost@example.com');
    expect(await authorizeVerifiedSession('ghost@example.com', ticket)).toBeNull();
  });

  it('rejects a stale ticket after the account email changed', async () => {
    const ticket = issueVerificationTicket('u-1', 'casey@example.com');
    users.set('u-1', { ...users.get('u-1')!, email: 'changed@example.com' });
    expect(await authorizeVerifiedSession('casey@example.com', ticket)).toBeNull();
  });
});
