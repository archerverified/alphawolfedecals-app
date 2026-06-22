// Single source of truth for the public support contact (Goal 20 D5 / F7).
//
// Finding F7: the footer + terms linked support@alphawolfdecals.com, a DIFFERENT
// domain than the one all transactional mail actually sends FROM
// (wraps@1stimpression.co) and that is SPF/DKIM-verified in Resend. Replies to a
// mailbox on the unverified alphawolfdecals.com domain would have gone unseen.
// Point Support at the 1stimpression.co domain the business controls + monitors.
//
// Override via NEXT_PUBLIC_SUPPORT_EMAIL (a public, build-time-inlined value) if
// the support mailbox ever moves, without a code change.
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@1stimpression.co';
