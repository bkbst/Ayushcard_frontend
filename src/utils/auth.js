// ─── Auth Utilities ────────────────────────────────────────────────────────────

/**
 * Read the stored token from either localStorage or sessionStorage.
 */
export const getStoredToken = () =>
    localStorage.getItem('token') || sessionStorage.getItem('token') || null;

/** Storage that holds the active session token (local wins if both exist). */
export const getActiveAuthStore = () =>
    localStorage.getItem('token') ? localStorage : sessionStorage;

/**
 * Read the stored user from the same storage as the active token.
 * Falls back to the other storage so stale localStorage user is not preferred
 * when the session token lives in sessionStorage.
 */
export const getStoredUser = () => {
    try {
        const store = getActiveAuthStore();
        const raw =
            store.getItem('user') ||
            localStorage.getItem('user') ||
            sessionStorage.getItem('user');
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

export const normalizeRole = (role) => {
    if (!role) return null;
    const s = String(role);
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

/** Role from the same storage as the active session token. */
export const getStoredUserRole = () => {
    const store = getActiveAuthStore();
    const storedRole =
        store.getItem('userRole') ||
        localStorage.getItem('userRole') ||
        sessionStorage.getItem('userRole');
    if (storedRole) return normalizeRole(storedRole);
    const user = getStoredUser();
    if (user?.role) return normalizeRole(user.role);
    return null;
};

export const updateStoredUser = (patch) => {
    const store = getActiveAuthStore();
    const current = getStoredUser() || {};
    const merged = { ...current, ...patch };
    store.setItem('user', JSON.stringify(merged));
    return merged;
};

/**
 * Decode a JWT payload WITHOUT verifying the signature.
 * Verification is done server-side; we only need the `exp` claim client-side.
 *
 * @param {string} token  Raw JWT string
 * @returns {object|null} Decoded payload or null if malformed
 */
export const decodeJwt = (token) => {
    try {
        if (!token || typeof token !== 'string') return null;
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        // Base64URL → Base64 → atob
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(
            atob(base64)
                .split('')
                .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
                .join('')
        );
        return JSON.parse(json);
    } catch {
        return null;
    }
};

/**
 * Returns true if the stored token exists AND has not expired.
 * Uses the JWT `exp` claim (seconds since Unix epoch).
 *
 * @param {number} bufferSeconds  Consider the token expired this many seconds
 *                                before the real `exp`. Default: 30 s.
 */
export const isTokenValid = (bufferSeconds = 30) => {
    const token = getStoredToken();
    if (!token) return false;

    const payload = decodeJwt(token);
    if (!payload) return false;

    // If there's no `exp` claim, treat the token as always valid (some
    // implementations issue non-expiring tokens — backend handles it).
    if (!payload.exp) return true;

    const nowSeconds = Math.floor(Date.now() / 1000);
    return payload.exp - bufferSeconds > nowSeconds;
};

/**
 * Returns the number of milliseconds until the token expires.
 * Returns 0 if already expired or no token present.
 */
export const msUntilExpiry = () => {
    const token = getStoredToken();
    if (!token) return 0;

    const payload = decodeJwt(token);
    if (!payload?.exp) return Infinity; // no expiry

    const expiresAt = payload.exp * 1000; // convert to ms
    return Math.max(0, expiresAt - Date.now());
};

/**
 * Returns true if a refresh token is stored.
 */
export const hasRefreshToken = () =>
    !!(localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken'));

/**
 * Returns true if the user can continue their session.
 * Meaning they either have a valid access token OR they have a refresh token
 * which can be used to obtain a new access token.
 */
export const canSessionContinue = () => {
    return isTokenValid() || hasRefreshToken();
};

/**
 * Clear all auth tokens from both storages.
 */
export const clearTokens = () => {
    ['token', 'refreshToken', 'user', 'userRole'].forEach((key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    });
};
