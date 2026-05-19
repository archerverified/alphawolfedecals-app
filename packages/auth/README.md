# @alphawolf/auth

Auth interface. Wraps Auth.js (credentials + email OTP) + the Supabase session
boundary. Per ADR-0001, all auth dependencies are routed through this package
so the underlying provider is replaceable.

**Status:** empty. Real implementation lands in the auth feature PR.
