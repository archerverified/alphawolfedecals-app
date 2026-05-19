// Client-safe OTP constants. Imported by both the server (for OTP issuance
// and verification) and the client (for input maxLength, helper copy, etc.).
//
// The actual generation/hashing/verification functions stay in ./otp because
// they depend on argon2 and node:crypto.

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes (PRD §10.1)
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MIN_INTERVAL_MS = 30 * 1000; // 30 seconds (PRD §10.1)
export const OTP_HOURLY_RESEND_LIMIT = 5; // 5 sends per email per hour
