// Goal 13 — full-journey B2C acceptance E2E on the BMW X3 (AW-TPL-0001).
//
// A single durable test that drives the COMPLETE customer journey end-to-end and
// captures an ordered screenshot gallery at every page + key action:
//
//   landing → signup → verify → welcome → signin → catalogue → vehicle detail →
//   editor (empty) → 11-step brief wizard → generate (3 concepts) → iterate →
//   select winner → free final → editor (locked AI layers + zones + in-editor AI)
//   → export the spec-pack PDF.
//
// LOCAL DEV ONLY. It uses the dev-otp peek (404 in production) and the FREE
// deterministic mock image provider (AI_PROVIDER=mock in .env.local); the
// orchestrator (Haiku) still makes a real sub-cent Anthropic call per run. It
// green-skips on any remote DEPLOY_URL target — same guard shape as
// generation.spec.ts / goal-12-editor.spec.ts. It must never join the prod smoke.
//
// COMPOSED on the proven specs — selectors/patterns reused verbatim from
//   support/flows.ts          (signUpAndVerify / signIn / uniqueEmail)
//   support/cleanup.ts        (cleanupCreatedProjects — net-zero teardown)
//   brief-wizard.spec.ts      (the 11-step wizard + export-PDF assertion)
//   generation.spec.ts        (the generation-studio credit/concept loop)
//   goal-12-editor.spec.ts    (the X3 Konva editor via __KONVA_STAGE__)
//
// Provider-agnostic: only the credit math (5→4→3) and the concept-card /
// final-badge / run-progress testids are asserted — never mock-only image bytes.

import * as fs from 'fs';
import * as path from 'path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { signIn, PASSWORD, uniqueEmail } from './support/flows';
import { cleanupCreatedProjects } from './support/cleanup';

// AW-TPL-0001 — the BMW X3, the most-paneled template (recognizable AI art +
// calibrated, selectable wrap zones). Same id as goal-12-editor.spec.ts.
const AW_X3_VEHICLE_ID = 'aa000001-0000-4000-8000-000000000001';

// Brand inputs for the journey (the prompt's fixed values).
const BRAND_PALETTE = ['#000000', '#FFFFFF', '#35B6E8'] as const; // black / white / cyan
const STYLE_PROMPT =
  'clean aggressive look, gloss black base, cyan accent stripes, white Alpha Wolf script on the doors';

// A real vector SVG (passes the logo quality gate — no opaque/DPI warnings).
const LOGO_SVG = path.resolve(__dirname, 'fixtures/alpha-wolf-logo.svg');
// A raster stand-in for the optional vehicle photo (brief photos step).
const PHOTO_PNG = path.resolve(__dirname, 'fixtures/opaque-logo.png');

// Ordered screenshot gallery — zero-padded numeric prefixes in journey order.
const SHOT_DIR = path.resolve(__dirname, '../../../docs/deployment/screenshots/2026-06-15-goal-13');

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

function isRemoteTarget(): boolean {
  const url = process.env.DEPLOY_URL;
  if (!url) return false;
  const { hostname } = new URL(url);
  return !['localhost', '127.0.0.1', '::1'].includes(hostname);
}

// Minimal shape of the dev-only Konva stage handle (CanvasStage exposes it when
// NODE_ENV !== 'production'). find returns nodes; fire(eventType, evt?, bubble?)
// dispatches a synthetic event up the parent chain when bubble is true.
type KNode = {
  fire: (evt: string, e?: unknown, bubble?: boolean) => void;
  draggable: () => boolean;
};
type StageHandle = { find: (s: string) => KNode[] };

function stageImageCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const stage = (window as unknown as { __KONVA_STAGE__?: StageHandle }).__KONVA_STAGE__;
    return stage ? stage.find('Image').length : 0;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POM drivers — one lightweight class per surface, shared `page`/`request`.
// ─────────────────────────────────────────────────────────────────────────────

/** Landing + auth surfaces (/, /signup, /verify, /welcome, /signin). */
class AuthDriver {
  constructor(
    private readonly page: Page,
    private readonly request: APIRequestContext,
  ) {}

  async landing(): Promise<void> {
    await this.page.goto('/');
    // Goal 14: the "Alpha Wolf Wrap Studio" wordmark moved to the eyebrow + the
    // placed logo; the hero H1 now carries the product headline.
    await expect(this.page.getByRole('heading', { name: /wrap your truck/i })).toBeVisible();
    await shot(this.page, '01-landing');
  }

  /**
   * Signs up + verifies a fresh customer, screenshotting /signup, /verify and
   * /welcome. Mirrors signUpAndVerify (support/flows.ts) step-for-step but
   * pauses for a shot at each page so the gallery captures the real flow.
   */
  async signUpAndVerify(email: string): Promise<void> {
    await this.page.goto('/signup');
    await this.page.locator('input[name="firstName"]').fill('E2E');
    await this.page.locator('input[name="lastName"]').fill('User');
    await this.page.locator('input[name="email"]').fill(email);
    await this.page.locator('input[name="password"]').fill(PASSWORD);
    await shot(this.page, '02-signup');
    await this.page.getByRole('button', { name: /create account/i }).click();

    await this.page.waitForURL(/\/verify\?email=/);
    await expect(this.page.getByRole('heading', { name: /check your email/i })).toBeVisible();
    await shot(this.page, '03-verify');

    // dev-otp peek — the Resend sandbox sender only delivers to the account
    // owner, so the OTP is read from the dev-only in-process endpoint.
    const code = await this.fetchOtp(email);
    await this.page.locator('input[name="code"]').fill(code);
    await this.page.getByRole('button', { name: /^verify$/i }).click();
    await this.page.waitForURL('/welcome');
    await expect(this.page.getByTestId('customer-welcome')).toBeVisible();
    await shot(this.page, '04-welcome');
  }

  async signIn(email: string, next: string): Promise<void> {
    await signIn(this.page, email, next);
  }

  private async fetchOtp(email: string): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const res = await this.request.get(`/api/auth/dev-otp?email=${encodeURIComponent(email)}`);
      if (res.ok()) return ((await res.json()) as { code: string }).code;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`No OTP found for ${email}`);
  }
}

/** Catalogue + project creation (/vehicles/select, /vehicles/:id). */
class CatalogueDriver {
  constructor(private readonly page: Page) {}

  async catalogue(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /choose your vehicle/i })).toBeVisible();
    await shot(this.page, '05-catalogue');
  }

  /**
   * Opens the X3 detail page, screenshots it, then starts a project → lands in
   * the editor. Reuses goal-12-editor.spec.ts's createProjectOnX3 robustness
   * (testid CTA with role-button fallbacks). Returns the new project id.
   */
  async startProjectOnX3(): Promise<string> {
    await this.page.goto(`/vehicles/${AW_X3_VEHICLE_ID}`);
    await expect(this.page.getByTestId('start-project-cta')).toBeVisible({ timeout: 15_000 });
    await shot(this.page, '06-vehicle-detail-x3');

    const cta = this.page.getByTestId('start-project-cta');
    if (await cta.isVisible().catch(() => false)) {
      await cta.click();
      const submit = this.page.getByTestId('start-project-submit');
      if (await submit.isVisible().catch(() => false)) {
        await submit.click();
      } else {
        await this.page
          .getByRole('dialog')
          .getByRole('button', { name: /create|start/i })
          .click();
      }
    } else {
      await this.page.getByRole('button', { name: /start a project/i }).click();
      await this.page
        .getByRole('dialog')
        .getByRole('button', { name: /create|start/i })
        .click();
    }

    await this.page.waitForURL(/\/projects\/[0-9a-f-]+\/editor/, { timeout: 60_000 });
    const m = this.page.url().match(/\/projects\/([0-9a-f-]+)\/editor/);
    if (!m) throw new Error('did not land in editor after starting a project');
    await this.page.getByTestId('canvas-ready').waitFor({ state: 'attached', timeout: 60_000 });
    await shot(this.page, '07-editor-empty');
    return m[1] as string;
  }
}

/** The 11-step guided design brief (/projects/:id/brief). */
class BriefWizardDriver {
  constructor(
    private readonly page: Page,
    private readonly projectId: string,
  ) {}

  /** From the editor header: open the brief and confirm the wizard mounts. */
  async open(): Promise<void> {
    await this.page.getByTestId('open-brief').click();
    await this.page.waitForURL(`**/projects/${this.projectId}/brief`);
    await expect(this.page.getByTestId('brief-wizard')).toBeVisible();
  }

  private tab(key: string) {
    return this.page.getByTestId(`brief-step-tab-${key}`);
  }

  /** Step 1 — zones: full wrap by default; toggle one panel out via the diagram. */
  async zones(): Promise<void> {
    await expect(this.page.getByTestId('brief-step-zones')).toBeVisible();
    await expect(this.page.getByTestId('zone-diagram')).toBeVisible();
    const firstPath = this.page.locator('[data-testid^="zone-path-"]').first();
    const pathTestId = await firstPath.getAttribute('data-testid');
    const panelId = pathTestId!.replace('zone-path-', '');
    await firstPath.click();
    await expect(firstPath).toHaveAttribute('aria-pressed', 'false');
    await expect(this.page.getByTestId(`zone-toggle-${panelId}`)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(this.page.getByTestId('zone-summary')).toHaveText(/of \d+ panels included/i);
    await shot(this.page, '08-brief-zones');
  }

  /** Step 2 — photos: optional vehicle photo upload + note. */
  async photos(): Promise<void> {
    await this.tab('photos').click();
    // Photos are OPTIONAL (PRD §3). The raster upload is parsed by the async
    // BullMQ/Upstash worker, which can lag on a cold worker or free-tier Redis
    // eviction — so this step is BEST-EFFORT: upload + a bounded wait for the
    // per-photo note, fill it if it surfaces, but NEVER block the journey on it.
    await this.page.getByTestId('photo-input').setInputFiles(PHOTO_PNG);
    const photoNote = this.page.locator('[data-testid^="photo-note-"]').first();
    const noteAppeared = await photoNote
      .waitFor({ state: 'visible', timeout: 45_000 })
      .then(() => true)
      .catch(() => false);
    if (noteAppeared) {
      await photoNote.fill('dent on rear left quarter panel');
    }
    await shot(this.page, '09-brief-photos');
  }

  /**
   * Step 3 — logo: upload the VECTOR svg → passes the quality gate (green
   * "Scales sharp" success, NOT the opaque/DPI warnings, which are raster-only),
   * then assign it to a zone.
   */
  async logo(): Promise<void> {
    await this.tab('logo').click();
    await this.page.getByTestId('logo-input').setInputFiles(LOGO_SVG);
    // The zone-assign chips render only once the asset row exists — that's the
    // upload-completed signal for a vector (no warning to assert against).
    const firstLogoZone = this.page.locator('[data-testid^="logo-zone-"]').first();
    await firstLogoZone.waitFor({ state: 'visible', timeout: 120_000 });
    // The vector is praised, never gated (LogoStep.isVector path). Distinct
    // success copy (Goal 14 D13-3) — no longer collides with the step hint's
    // "…or a vector file (SVG/AI/EPS)…".
    await expect(this.page.getByText(/scales sharp to any size/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(this.page.getByTestId('logo-warning-opaque')).toHaveCount(0);
    await firstLogoZone.click();
    await expect(firstLogoZone).toHaveAttribute('aria-pressed', 'true');
    await shot(this.page, '10-brief-logo');
  }

  /**
   * Step 4 — colors: land the brand palette black/white/cyan in color-picks via
   * the native picker (deterministic; extract-from-logo is best-effort below).
   */
  async colors(): Promise<void> {
    await this.tab('colors').click();
    const pickerInput = this.page.getByTestId('color-picker-input');
    const addBtn = this.page.getByTestId('color-picker-add');
    for (const hex of BRAND_PALETTE) {
      // A native <input type="color"> only accepts lowercase 6-hex via fill().
      await pickerInput.fill(hex.toLowerCase());
      await addBtn.click();
    }
    await expect(this.page.getByTestId('color-picks').locator('li')).toHaveCount(
      BRAND_PALETTE.length,
    );
    // Bonus (best-effort): also pull colors from the logo. The svg embeds a
    // raster, so extraction may return 0 chips — don't assert it.
    await this.page
      .getByTestId('color-extract')
      .click()
      .catch(() => undefined);
    await shot(this.page, '11-brief-colors');
  }

  /** Step 5 — style: the Aggressive preset + the brand free-text prompt. */
  async style(): Promise<void> {
    await this.tab('style').click();
    await this.page.getByRole('button', { name: 'Aggressive', exact: true }).click();
    await this.page.getByTestId('style-prompt').fill(STYLE_PROMPT);
    await shot(this.page, '12-brief-style');
  }

  /** Step 6 — per-zone notes: add one panel note (textareas, no per-row testid). */
  async zoneNotes(): Promise<void> {
    await this.tab('zoneNotes').click();
    const noteArea = this.page.getByTestId('brief-step-zoneNotes').locator('textarea').first();
    await noteArea.waitFor({ state: 'visible', timeout: 15_000 });
    await noteArea.fill('keep the hood mostly black, cyan stripe runs over the roof');
    await shot(this.page, '13-brief-zone-notes');
  }

  /** Step 7 — materials: pick the premium-cast tier. */
  async materials(): Promise<void> {
    await this.tab('materials').click();
    const premium = this.page.getByRole('button', { name: /premium cast vinyl/i });
    await premium.click();
    await expect(premium).toHaveAttribute('aria-pressed', 'true');
    await shot(this.page, '14-brief-materials');
  }

  /** Step 8 — tint: pick a state + a VLT, assert the legality verdict renders. */
  async tint(): Promise<void> {
    await this.tab('tint').click();
    await this.page.getByTestId('tint-state').selectOption('GA'); // GA front min = 32% VLT
    await this.page.getByTestId('tint-front-20').click(); // too dark → illegal
    await expect(this.page.getByTestId('tint-verdict-front')).toHaveAttribute(
      'data-status',
      'illegal',
    );
    await this.page.getByTestId('tint-front-50').click(); // legal → verdict flips
    await expect(this.page.getByTestId('tint-verdict-front')).toHaveAttribute(
      'data-status',
      'legal',
    );
    await shot(this.page, '15-brief-tint');
  }

  /** Step 9 — extras: toggle one extra on. */
  async extras(): Promise<void> {
    await this.tab('extras').click();
    const extra = this.page.getByRole('button', { name: /pinstripe \/ accents/i });
    await extra.click();
    await expect(extra).toHaveAttribute('aria-pressed', 'true');
    await shot(this.page, '16-brief-extras');
  }

  /** Step 10 — notes for the AI: fill the catch-all note. */
  async aiNotes(): Promise<void> {
    await this.tab('aiNotes').click();
    const notes = this.page.getByTestId('brief-step-aiNotes').locator('textarea').first();
    await notes.fill('Alpha Wolf is a marine / off-road brand — make it look fast and premium.');
    await shot(this.page, '17-brief-ai-notes');
  }

  /**
   * Step 11 — review: confirm the credit cost is shown (it lives on the Generate
   * button per PRD §5), then kick off generation.
   */
  async reviewAndGenerate(): Promise<void> {
    await this.tab('review').click();
    await expect(this.page.getByTestId('brief-step-review')).toBeVisible();
    // PRD §5 hard rule: the cost is ON the Generate button (not a separate cost
    // element). "Generate 3 concepts — uses 1 credit".
    const generate = this.page.getByTestId('generate-concepts');
    await expect(generate).toBeVisible();
    await expect(generate).toContainText(/uses 1 credit/i);
    await shot(this.page, '18-brief-review');
    await generate.click();
  }
}

/** The AI generation studio (/projects/:id/generate). */
class GenerationStudioDriver {
  constructor(
    private readonly page: Page,
    private readonly projectId: string,
  ) {}

  /** Land in the studio (1 credit spent: 5 → 4), watch the run, get 3 concepts. */
  async awaitThreeConcepts(): Promise<void> {
    await this.page.waitForURL(new RegExp(`/projects/${this.projectId}/generate`));
    await expect(this.page.getByTestId('generation-studio')).toBeVisible();
    await expect(this.page.getByTestId('credit-balance')).toContainText('4 credits');
    await expect(this.page.getByTestId('run-progress')).toBeVisible();
    await shot(this.page, '19-generate-in-progress');

    await expect(this.page.getByTestId('concept-card-literal')).toBeVisible({ timeout: 240_000 });
    await expect(this.page.getByTestId('concept-card-bolder')).toBeVisible();
    await expect(this.page.getByTestId('concept-card-minimal')).toBeVisible();
    await shot(this.page, '20-three-concepts');
  }

  /** Refine the literal concept once (1 credit: 4 → 3); wait for completion. */
  async iterateOnce(): Promise<void> {
    await this.page.getByTestId('iteration-chip-literal-2').click(); // a quick-tweak chip
    // The chip fills the refine box asynchronously — retry the assertion so it
    // can't race the populate (code-review flake fix).
    await expect(this.page.getByTestId('refine-input-literal')).not.toHaveValue('', {
      timeout: 15_000,
    });
    await this.page.getByTestId('refine-submit-literal').click();
    await expect(this.page.getByTestId('run-progress')).toBeVisible({ timeout: 60_000 });
    await expect(this.page.getByTestId('credit-balance')).toContainText('3 credits', {
      timeout: 60_000,
    });
    await expect(this.page.getByTestId('run-progress')).toBeHidden({ timeout: 240_000 });
    await shot(this.page, '21-after-iteration');
  }

  /** Select the literal concept → free final → final badge (balance unchanged). */
  async selectWinner(): Promise<void> {
    await this.page.getByTestId('use-design-literal').click();
    await expect(this.page.getByTestId('final-confirm')).toBeVisible();
    await this.page.getByTestId('confirm-final').click();
    await expect(this.page.getByTestId('final-badge-literal')).toBeVisible({ timeout: 240_000 });
    await expect(this.page.getByTestId('credit-balance')).toContainText('3 credits');
    await shot(this.page, '22-final-selected');
  }

  /** Hand off to the editor for the winning concept. */
  async openEditor(): Promise<void> {
    await this.page.getByTestId('open-editor-literal').click();
    await this.page.waitForURL(`**/projects/${this.projectId}/editor`);
  }
}

/** The Konva design editor (/projects/:id/editor). */
class EditorDriver {
  constructor(
    private readonly page: Page,
    private readonly projectId: string,
  ) {}

  /**
   * Asserts the editor carries the journey forward: canvas ready, the X3 art +
   * locked AI final layers + composited logo render, the multi-view camera, a
   * selectable wrap zone, and the in-editor "Design with AI" entry.
   */
  async assertCarriesJourney(): Promise<void> {
    await this.page.getByTestId('canvas-ready').waitFor({ state: 'attached', timeout: 60_000 });
    await expect(this.page.getByTestId('editor-root').last()).toBeVisible();

    // X3 art + AI final layers mount as Konva Image nodes (poll: they appear
    // only after the cross-origin HTMLImage onload fires).
    await expect
      .poll(() => stageImageCount(this.page), {
        message: 'vehicle art + AI layers should mount as Image nodes on the Konva stage',
        timeout: 60_000,
        intervals: [500, 1000, 2000],
      })
      .toBeGreaterThan(0);

    // Locked AI final layers are non-draggable Image nodes (vs. user-placed,
    // draggable images) — the handoff carried them in.
    const lockedCount = await this.page.evaluate(() => {
      const stage = (window as unknown as { __KONVA_STAGE__?: StageHandle }).__KONVA_STAGE__;
      if (!stage) return 0;
      return stage.find('Image').filter((n) => !n.draggable()).length;
    });
    expect(lockedCount).toBeGreaterThan(0);

    // Multi-view camera: the X3's 4 faces + "all" frame the art.
    await expect(this.page.getByTestId('view-selector')).toBeVisible();
    for (const v of ['view-all', 'view-driver', 'view-front', 'view-back', 'view-passenger']) {
      await expect(this.page.getByTestId(v)).toBeVisible();
    }
    await this.page.getByTestId('view-all').click();
    await expect(this.page.getByTestId('view-all')).toHaveAttribute('aria-pressed', 'true');
    await shot(this.page, '23-editor-with-art');

    // Select a wrap zone via the stage handle → its name + calibrated area
    // surface in the inspector.
    const fired = await this.page.evaluate(() => {
      const stage = (window as unknown as { __KONVA_STAGE__?: StageHandle }).__KONVA_STAGE__;
      if (!stage) return false;
      const zone = stage.find('.wrap-zone')[0];
      if (!zone) return false;
      zone.fire('click', { type: 'click' }, true); // bubble → Path onClick → onZoneSelect
      return true;
    });
    expect(fired).toBe(true);
    await expect(this.page.getByTestId('zone-inspector')).toBeVisible();
    await expect(this.page.getByTestId('zone-name')).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId('zone-name')).not.toHaveText('');
    await expect(this.page.getByTestId('zone-area')).toBeVisible({ timeout: 15_000 });
    await shot(this.page, '24-editor-zone-selected');

    // In-editor AI assistant (top bar): the dialog shows the credit cost up front.
    const aiButton = this.page.getByRole('banner').getByTestId('design-with-ai');
    await expect(aiButton).toBeVisible();
    await aiButton.click();
    await expect(this.page.getByTestId('ai-credit-balance')).toBeVisible({ timeout: 15_000 });
    await shot(this.page, '25-editor-ai-dialog');
    // Close the dialog so the next screenshot/export isn't behind a modal.
    await this.page.keyboard.press('Escape');
  }

  /**
   * Export the Wrap Spec Pack PDF through the real authenticated route, assert
   * it's a genuine multi-page PDF, and save the bytes into the gallery dir.
   */
  async exportSpecPack(): Promise<void> {
    const res = await this.page.request.get(`/projects/${this.projectId}/export`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/pdf');
    const pdf = await res.body();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5_000); // a real pack, not an error body
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    fs.writeFileSync(path.join(SHOT_DIR, 'goal-13-export-pack.pdf'), pdf);
    await shot(this.page, '26-export-pack');
  }
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Goal 13 — full B2C customer journey on the BMW X3 (mock provider)', () => {
  test.skip(
    isRemoteTarget(),
    'Full-journey acceptance — local dev only (dev-otp + mock provider). Production uses the real provider.',
  );

  // Net-zero (Goal 9.1 D1): soft-delete every project this spec creates through
  // the real owner UI path — this also exercises the cleanup path itself.
  const createdProjectIds: string[] = [];
  test.afterEach(async ({ page }) => {
    await cleanupCreatedProjects(page, createdProjectIds);
  });

  test('landing → signup → catalogue → brief → generate → editor → export', async ({
    page,
    request,
  }) => {
    // Dev-mode cold compiles + the full signup→brief journey (two uploads) + 3
    // poll-driven AI runs (initial / iteration / final) + an editor visit +
    // teardown all share one budget — give it the wide ceiling generation.spec
    // uses.
    test.setTimeout(600_000);

    const email = uniqueEmail('g13');
    const auth = new AuthDriver(page, request);
    const catalogue = new CatalogueDriver(page);

    // 1–2. Landing → sign up → verify → welcome.
    await auth.landing();
    await auth.signUpAndVerify(email);

    // 3. Sign in → catalogue.
    await auth.signIn(email, '/vehicles/select');
    await catalogue.catalogue();

    // 4. Pick the X3 → start a project → land in the editor (empty).
    const projectId = await catalogue.startProjectOnX3();
    createdProjectIds.push(projectId);

    // 5. Brief wizard — all 11 steps, screenshotting each.
    const brief = new BriefWizardDriver(page, projectId);
    await brief.open();
    await brief.zones();
    await brief.photos();
    await brief.logo();
    await brief.colors();
    await brief.style();
    await brief.zoneNotes();
    await brief.materials();
    await brief.tint();
    await brief.extras();
    await brief.aiNotes();
    await brief.reviewAndGenerate();

    // 6–8. Generate (5→4) → 3 concepts → iterate (4→3) → select winner (free).
    const studio = new GenerationStudioDriver(page, projectId);
    await studio.awaitThreeConcepts();
    await studio.iterateOnce();
    await studio.selectWinner();
    await studio.openEditor();

    // 9. Editor carries the journey: art + locked AI layers + zones + in-editor AI.
    const editor = new EditorDriver(page, projectId);
    await editor.assertCarriesJourney();

    // 10. Export the spec-pack PDF.
    await editor.exportSpecPack();
  });
});
