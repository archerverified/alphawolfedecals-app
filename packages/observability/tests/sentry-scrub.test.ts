import { describe, expect, it } from 'vitest';
import type { Event } from '@sentry/core';

import { scrubSentryEvent } from '../src/sentry-scrub';

describe('scrubSentryEvent', () => {
  it('strips user.email/ip_address/username but keeps the opaque id', () => {
    const event: Event = {
      user: {
        id: 'user_123',
        email: 'someone@example.com',
        ip_address: '203.0.113.7',
        username: 'someone',
      },
    };

    const result = scrubSentryEvent(event);

    expect(result.user).toEqual({ id: 'user_123' });
    expect(result.user?.email).toBeUndefined();
    expect(result.user?.ip_address).toBeUndefined();
    expect(result.user?.username).toBeUndefined();
  });

  it('drops request.cookies entirely', () => {
    const event: Event = {
      request: {
        cookies: { session: 'do-not-leak', csrf: 'do-not-leak' },
      },
    };

    const result = scrubSentryEvent(event);

    expect(result.request?.cookies).toBeUndefined();
  });

  it('redacts sensitive request headers case-insensitively, keeps benign ones', () => {
    const event: Event = {
      request: {
        headers: {
          // synthetic values only — never real credentials
          Authorization: 'Bearer test',
          Cookie: 'session=test',
          'X-CSRF-Token': 'test',
          'Content-Type': 'application/json',
          'User-Agent': 'vitest',
        },
      },
    };

    const result = scrubSentryEvent(event);

    expect(result.request?.headers?.['Authorization']).toBe('[redacted]');
    expect(result.request?.headers?.['Cookie']).toBe('[redacted]');
    expect(result.request?.headers?.['X-CSRF-Token']).toBe('[redacted]');
    // benign headers survive untouched
    expect(result.request?.headers?.['Content-Type']).toBe('application/json');
    expect(result.request?.headers?.['User-Agent']).toBe('vitest');
  });

  it('redacts query-string tokens in request.url, preserving other params', () => {
    const event: Event = {
      request: {
        url: 'https://app.example.com/projects?token=abc&foo=bar',
        query_string: 'token=abc&foo=bar',
      },
    };

    const result = scrubSentryEvent(event);

    expect(result.request?.url).toBe('https://app.example.com/projects?token=[redacted]&foo=bar');
    expect(result.request?.query_string).toBe('[redacted]');
  });

  it('redacts the token in a Supabase signed-URL breadcrumb', () => {
    const event: Event = {
      breadcrumbs: [
        {
          category: 'fetch',
          data: {
            url: 'https://x.supabase.co/storage/v1/object/sign/assets/a.png?token=eyJhbGciOi.payload.sig',
            method: 'GET',
          },
        },
      ],
    };

    const result = scrubSentryEvent(event);

    const crumb = result.breadcrumbs?.[0];
    expect(crumb?.data?.url).toBe(
      'https://x.supabase.co/storage/v1/object/sign/assets/a.png?token=[redacted]',
    );
    // non-URL breadcrumb data is left alone
    expect(crumb?.data?.method).toBe('GET');
  });

  it('passes a clean event through untouched (no false positives)', () => {
    const event: Event = {
      message: 'something happened',
      level: 'error',
      user: { id: 'user_42' },
      request: {
        url: 'https://app.example.com/projects',
        headers: { 'Content-Type': 'application/json' },
      },
      breadcrumbs: [{ category: 'navigation', data: { from: '/a', to: '/b' } }],
    };

    const result = scrubSentryEvent(event);

    expect(result.message).toBe('something happened');
    expect(result.level).toBe('error');
    expect(result.user).toEqual({ id: 'user_42' });
    expect(result.request?.url).toBe('https://app.example.com/projects');
    expect(result.request?.headers?.['Content-Type']).toBe('application/json');
    expect(result.breadcrumbs?.[0]?.data).toEqual({ from: '/a', to: '/b' });
  });
});
