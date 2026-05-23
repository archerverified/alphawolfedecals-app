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
export * as projects from './repos/projects.js';
export * as storage from './storage/supabase.js';
export * as svg from './svg/validate.js';

export type { AccountType, AccountStatus, DecryptedUser } from './repos/users.js';
export type { MembershipRole, ShopSummary } from './repos/shops.js';
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
  ProjectRow,
  WorkingVersionRow,
  AssetRow,
  SaveResult,
  ProjectStatus,
  ApprovalState,
  AssetParseStatus,
} from './repos/projects.js';
export type {
  SvgValidationResult,
  SvgValidationError,
  ExtractedPanel,
  OutlineDims,
} from './svg/validate.js';
