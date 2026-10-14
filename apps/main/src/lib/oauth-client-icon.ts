/**
 * Same-origin URL for an OAuth app's icon. Icons live on the developer's own
 * host, which the CSP doesn't allow and which would see every consent-page
 * visitor, so they're proxied. `v` changes with the icon URL to bust caches.
 */
export function clientIconSrc(clientId: string, icon: string | null | undefined): string | undefined {
  if (!icon) return undefined;
  let h = 0x811c9dc5;
  for (let i = 0; i < icon.length; i++) h = Math.imul(h ^ icon.charCodeAt(i), 0x01000193);
  return `/api/oauth/client-icon/${encodeURIComponent(clientId)}?v=${(h >>> 0).toString(36)}`;
}
