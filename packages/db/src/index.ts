// Public surface of @alphawolf/db.
//
// Other workspace packages must import from here, never from @prisma/client
// directly. Enforced by the no-restricted-imports rule in eslint.config.mjs.

export * from './client.js';
export * from './crypto.js';
export * as users from './repos/users.js';
export * as shops from './repos/shops.js';
export * as otp from './repos/otp.js';
export * as authEvents from './repos/auth-events.js';
export * as rateLimit from './repos/rate-limit.js';
export * as vehicles from './repos/vehicles.js';
export * as vehicleRequests from './repos/vehicle-template-requests.js';
export * as templateSources from './repos/template-sources.js';
export * as projects from './repos/projects.js';
export * as orders from './repos/orders.js';
export * as credits from './repos/credits.js';
export * as briefs from './repos/briefs.js';
export * as generation from './repos/generation.js';
export * as share from './repos/share.js';
export * as referrals from './repos/referrals.js';
export * as maintenance from './repos/maintenance.js';
export * as storage from './storage/supabase.js';
export * as svg from './svg/index.js';

export type { AccountType, AccountStatus, DecryptedUser } from './repos/users.js';
export type { MembershipRole, ShopSummary, PublicShop } from './repos/shops.js';
export type { OtpPurpose, OtpRow } from './repos/otp.js';
export type { AuthEventType } from './repos/auth-events.js';
export type { RateLimitDecision, RateLimitStatus } from './repos/rate-limit.js';
export type {
  VehicleSummary,
  VehicleDetail,
  VehicleFacets,
  CascadeFilter,
  CreateVehicleInput,
  PanelInput,
  PanelRecord,
  AlphaWolfTemplateFields,
  AlphaWolfTemplateCard,
  BodyType,
  TemplateStatus,
  SourceAuthority,
  FinishHint,
} from './repos/vehicles.js';
export type {
  TemplateRequest,
  CreateRequestInput,
  RequestStatus,
} from './repos/vehicle-template-requests.js';
export type {
  TemplateSourceKind,
  TemplateSourceRow,
  CreateSourceInput,
  SourceMeasurements,
} from './repos/template-sources.js';
export type {
  ProjectRow,
  WorkingVersionRow,
  AssetRow,
  SaveResult,
  ProjectStatus,
  ApprovalState,
  AssetParseStatus,
} from './repos/projects.js';
export type {
  OrderRow,
  ShopOrderRow,
  OrderStatus,
  SubmitResult,
  TransitionResult,
} from './repos/orders.js';
export type { CreditSource, CreditLedgerRow } from './repos/credits.js';
export type {
  BriefRow,
  BriefSaveResult,
  BriefSnapshotResult,
  BriefSnapshotRow,
} from './repos/briefs.js';
export type {
  GenerationRunKind,
  GenerationRunStatus,
  GenerationJobStatus,
  RenderTarget,
  GenerationRunRow,
  GenerationJobRow,
  GenerationImageRow,
  StartRunInput,
  StartRunResult,
  RunContext,
  RunPatch,
  FailRunResult,
  RunWithImages,
  RecordJobInput,
  InsertImageInput,
} from './repos/generation.js';
export type { ShareConcept, PublicShare, VoteResult } from './repos/share.js';
export type { ReferralStats, ReferralGrantResult } from './repos/referrals.js';
export { CREDIT_CONFIG, PLAN_LIMITS } from './credit-config.js';
export type { PlanName } from './credit-config.js';
export {
  AI_CONFIG,
  AI_MODELS,
  estimateImageCostUsd,
  ORCHESTRATOR_MODELS,
  DEFAULT_ORCHESTRATOR_MODEL,
  resolveOrchestratorModel,
  PHOTO_VIEW,
} from './ai-config.js';
export type {
  AiModelKey,
  AiModelConfig,
  AiModelPricing,
  OrchestratorModelId,
  ResolvedOrchestratorModel,
} from './ai-config.js';
// THE canonical view order (PR #142 numbering decision). Shared so consumers
// (sheet renderers, AI orchestrator) cannot drift from the panel-number order.
export { VIEW_ORDER, outlineBbox } from './svg/numbering.js';
export type {
  SvgValidationResult,
  SvgValidationError,
  ExtractedPanel,
  OutlineDims,
  OutlineValidationOptions,
} from './svg/validate.js';
export type { BuildOutlineInput, OutlineViewSpec, OutlinePanelSpec } from './svg/build-outline.js';
export type { VehicleDimsMm, ViewAxis, ViewCalibration } from './svg/calibrate.js';
export type { LayoutSheetInput, LayoutSheetView, LayoutSheetPanel } from './svg/layout-sheet.js';
