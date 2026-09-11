export async function fetchPreviewCatalog(baseUrl, fetcher = fetch) {
  const base = baseUrl.replace(/\/+$/, "");
  const metadata = await fetcher(`${base}/api/v1/songs/versions?region=jp`);
  if (!metadata.ok) throw new Error(`Catalog version fetch failed: ${metadata.status}`);
  const { currentVersion } = await metadata.json();
  if (!Number.isInteger(currentVersion) || currentVersion < -32768 || currentVersion > 32767) {
    throw new Error("Invalid current JP catalog version");
  }
  const response = await fetcher(`${base}/api/v1/songs?region=jp&gameVersion=${currentVersion}`);
  if (!response.ok) throw new Error(`Catalog fetch failed: ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.songs)) throw new Error("Invalid song catalog response");
  return body.songs;
}
