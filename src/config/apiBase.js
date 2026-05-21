/** Live backend (Railway) — OCR and main API. */
export const DEFAULT_API_ORIGIN = "https://bkbsbackend-production.up.railway.app";

export function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL || "";
}

/** Resolve relative upload paths when not using same-origin /api. */
export function getFileOriginForRelativePaths() {
  const configured = getApiBaseUrl().replace(/\/api\/?$/, "");
  if (configured) return configured;
  if (
    typeof window !== "undefined" &&
    /localhost|127\.0\.0\.1/.test(window.location.hostname)
  ) {
    return DEFAULT_API_ORIGIN;
  }
  return "";
}
