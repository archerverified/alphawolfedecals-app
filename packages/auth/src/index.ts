// Public surface of @alphawolf/auth. The Next.js-specific NextAuth() handler
// lives at @alphawolf/auth/server.

export {
  signupCustomer,
  signupShop,
  resendVerificationOtp,
  verifySignupOtp,
  customerSignupSchema,
  shopSignupSchema,
  type CustomerSignupInput,
  type ShopSignupInput,
  type SignupResult,
  type ResendResult,
  type VerifyResult,
} from './signup';

export { login, type LoginResult } from './login';

export { hashPassword, verifyPassword, validatePasswordPolicy, passwordStrength } from './password';

export {
  generateOtpCode,
  hashOtp,
  verifyOtp,
  otpExpiry,
  OTP_LENGTH,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_MIN_INTERVAL_MS,
  OTP_HOURLY_RESEND_LIMIT,
} from './otp';

export {
  checkLoginGuards,
  recordLoginFailure,
  clearLoginFailures,
  IP_LOGIN_THRESHOLD,
  IP_LOGIN_WINDOW_MS,
  ACCOUNT_LOGIN_THRESHOLD,
  ACCOUNT_LOCKOUT_MS,
  type LockoutGuard,
  type FailureOutcome,
} from './lockout';

export { generateCsrfToken, verifyCsrf, CSRF_COOKIE_NAME, CSRF_FIELD_NAME } from './csrf';

export { sendOtpEmail, _getDevOtp, _stashDevOtp } from './email';
