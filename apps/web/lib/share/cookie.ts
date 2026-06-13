// Opaque per-visitor id for share-page voting (Goal 9). httpOnly + scoped to
// /share by the vote route; read by the share page to attribute the view event.
// NOT PII — a random token, the only thing identifying an anonymous voter.
export const VOTER_COOKIE = 'aw_voter';
