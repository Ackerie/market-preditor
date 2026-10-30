const VERCEL_PREVIEW_ORIGIN =
  /^https:\/\/market-predictor-[a-z0-9-]+-ackeries-projects\.vercel\.app$/;
const NATIVE_APP_ORIGINS = new Set([
  "https://localhost",
  "capacitor://localhost",
]);

export function isNativeAppOrigin(origin: string | undefined): boolean {
  return origin != null && NATIVE_APP_ORIGINS.has(origin);
}

export function isAllowedAppOrigin(
  origin: string,
  configuredOrigins: ReadonlySet<string>,
): boolean {
  return (
    configuredOrigins.has(origin) ||
    NATIVE_APP_ORIGINS.has(origin) ||
    VERCEL_PREVIEW_ORIGIN.test(origin)
  );
}
