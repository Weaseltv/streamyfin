/** `https://media.theweasel.tv:8920/jellyfin` → `media.theweasel.tv`. */
export const serverHost = (url?: string | null): string => {
  if (!url) return "";
  try {
    return new URL(url).hostname || url;
  } catch {
    return url.replace(/^https?:\/\//, "").split(/[/:]/)[0] || url;
  }
};
