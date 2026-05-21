// Parallel-route fallback for the @detail slot. Renders for any /db URL
// that doesn't match @detail/[type]/[slug]/page.tsx — i.e. /db itself,
// /db/posts, /db/posts/[id], or any /db/[type] page without a /[slug] segment.
// Returning null leaves the drawer in its closed state.
export default function Default() {
  return null;
}
