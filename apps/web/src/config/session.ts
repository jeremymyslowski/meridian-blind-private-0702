/**
 * Client session configuration.
 */

/** Minutes before client treats session as expired. */
export const TOKEN_TTL_MINUTES = 30

/** Used by AuthContext for session expiry checks. */
export const TOKEN_TTL_MS = TOKEN_TTL_MINUTES * 60 * 1000