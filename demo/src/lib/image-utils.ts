/**
 * Optional image URL optimization helper.
 * For self-hosted storage, keep as a no-op (there is no built-in transformation CDN).
 */
export const optimizeImageUrl = (
  url: string | null | undefined,
  _options: { width?: number; height?: number; quality?: number } = {}
): string | null => {
  if (!url) return null;

  return url;
};
