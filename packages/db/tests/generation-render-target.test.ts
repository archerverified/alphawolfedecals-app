// Unit tests for the render_target discriminator added in Goal 21 / T1.
// No DB - these run in the default `unit` vitest project alongside the other
// generation-helpers tests.
//
// Because recordJobs and insertImage require a live Prisma client (withUser),
// this file tests the contract at the type and input-shaping level: it verifies
// that the RecordJobInput and InsertImageInput types expose renderTarget, that
// the GenerationJobRow and GenerationImageRow types expose renderTarget, and
// that the defaults are correct in a simple construction test.
//
// The RLS integration test (generation-rls.integration.test.ts) covers the full
// DB round-trip once the migration is applied to the dev database.

import { describe, expect, test } from 'vitest';

import type {
  GenerationImageRow,
  GenerationJobRow,
  InsertImageInput,
  RecordJobInput,
  RenderTarget,
} from '../src/repos/generation';

// ---------------------------------------------------------------------------
// Type-level assertions: these will produce a compile error if the field is
// missing from the type, which is exactly the regression we want to catch.
// ---------------------------------------------------------------------------

describe('RenderTarget union type', () => {
  test('is exactly "template" | "photo"', () => {
    const t: RenderTarget = 'template';
    const p: RenderTarget = 'photo';
    expect(t).toBe('template');
    expect(p).toBe('photo');
  });

  test('GenerationJobRow has renderTarget typed as RenderTarget', () => {
    // Build a minimal GenerationJobRow literal - TS will error at compile time
    // if renderTarget is missing from the type.
    const row: GenerationJobRow = {
      id: 'job-1',
      runId: 'run-1',
      conceptKey: 'bold',
      view: 'driver',
      status: 'pending',
      providerRequestId: null,
      prompt: '',
      costUsd: 0,
      error: null,
      renderTarget: 'template',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(row.renderTarget).toBe('template');
  });

  test('GenerationImageRow has renderTarget typed as RenderTarget', () => {
    const row: GenerationImageRow = {
      id: 'img-1',
      runId: 'run-1',
      jobId: 'job-1',
      conceptKey: 'bold',
      view: 'driver',
      storagePath: 'gen/proj/img.png',
      previewPath: null,
      width: 1024,
      height: 768,
      provider: 'fal',
      model: 'flux/dev',
      providerRequestId: null,
      costUsd: 0.07,
      provenance: null,
      renderTarget: 'photo',
      createdAt: new Date(),
    };
    expect(row.renderTarget).toBe('photo');
  });
});

describe('RecordJobInput renderTarget default semantics', () => {
  test('renderTarget is optional on RecordJobInput (absent = template)', () => {
    // This is a type test: if renderTarget is required, omitting it would cause
    // a TS compile error. The runtime assertion validates the intent.
    const withoutTarget: RecordJobInput = { conceptKey: 'bold', view: 'driver' };
    const withTemplate: RecordJobInput = {
      conceptKey: 'bold',
      view: 'driver',
      renderTarget: 'template',
    };
    const withPhoto: RecordJobInput = {
      conceptKey: 'bold',
      view: 'driver',
      renderTarget: 'photo',
    };
    // The field is absent (undefined) when not provided - callers in recordJobs
    // coalesce it to 'template' via `j.renderTarget ?? 'template'`.
    expect(withoutTarget.renderTarget).toBeUndefined();
    expect(withTemplate.renderTarget).toBe('template');
    expect(withPhoto.renderTarget).toBe('photo');
  });

  test('coalesce from undefined to "template" matches the recordJobs default', () => {
    const jobs: RecordJobInput[] = [
      { conceptKey: 'a', view: 'front' },
      { conceptKey: 'b', view: 'rear', renderTarget: 'photo' },
    ];
    const resolved = jobs.map((j) => j.renderTarget ?? 'template');
    expect(resolved).toEqual(['template', 'photo']);
  });
});

describe('InsertImageInput renderTarget default semantics', () => {
  test('renderTarget is optional on InsertImageInput (absent = template)', () => {
    const base = {
      runId: 'run-1',
      jobId: 'job-1',
      conceptKey: 'bold',
      view: 'driver',
      storagePath: 'gen/proj/img.png',
      width: 1024,
      height: 768,
      provider: 'fal',
      model: 'flux/dev',
      costUsd: 0.07,
    } satisfies InsertImageInput;
    // renderTarget absent on base - coalesces to 'template' in insertImage.
    expect(base.renderTarget).toBeUndefined();
    const resolved = base.renderTarget ?? 'template';
    expect(resolved).toBe('template');
  });

  test('photo target flows through when supplied', () => {
    const input: InsertImageInput = {
      runId: 'run-1',
      jobId: 'job-1',
      conceptKey: 'bold',
      view: 'driver',
      storagePath: 'gen/proj/img.png',
      width: 1024,
      height: 768,
      provider: 'fal',
      model: 'flux/dev',
      costUsd: 0.07,
      renderTarget: 'photo',
    };
    const resolved = input.renderTarget ?? 'template';
    expect(resolved).toBe('photo');
  });
});
