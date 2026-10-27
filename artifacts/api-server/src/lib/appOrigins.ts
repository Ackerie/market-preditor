const VERCEL_PREVIEW_ORIGIN =
  /^https:\/\/market-predictor-[a-z0-9-]+-ackeries-projects\.vercel\.app$/;

export function isAllowedAppOrigin(
  origin: string,
  configuredOrigins: ReadonlySet<string>,
): boolean {
  return (
    configuredOrigins.has(origin) || VERCEL_PREVIEW_ORIGIN.test(origin)
  );
}
