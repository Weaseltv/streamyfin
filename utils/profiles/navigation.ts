const adultRoutes = new Set([
  "(settings)",
  "settings",
  "downloads",
  "sessions",
  "quick-connect-scan",
  "livetv",
  "persons",
  "(custom-links)",
]);

export const isAdultOnlyRoute = (segments: readonly string[]) =>
  segments.some((segment) => adultRoutes.has(segment));
