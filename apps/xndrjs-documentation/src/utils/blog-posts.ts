import type { CollectionEntry } from "astro:content";
import { getCollection } from "astro:content";

/** Normalized collection id without file extension. */
export function blogEntryBaseId(id: string): string {
  return id.replace(/\.mdx?$/i, "");
}

/** Blog listing slug: Starlight may expose `blog` or `blog/index` for `blog/index.md(x)`. */
export function isBlogIndexBase(base: string): boolean {
  return base === "blog" || base === "blog/index";
}

/** True for markdown/MDX posts under `blog/`, excluding the blog index page. */
export function isBlogPost(entry: CollectionEntry<"docs">): boolean {
  const base = blogEntryBaseId(entry.id);
  if (isBlogIndexBase(base)) return false;
  return base.startsWith("blog/");
}

/** Starlight docs route id is under the blog section (index or a post). */
export function isBlogAreaRoute(docId: string): boolean {
  const base = blogEntryBaseId(docId);
  return isBlogIndexBase(base) || base.startsWith("blog/");
}

export function postTime(entry: CollectionEntry<"docs">): number | null {
  const d = entry.data.date;
  return d instanceof Date ? d.getTime() : null;
}

export function sortBlogPostsNewestFirst(
  entries: CollectionEntry<"docs">[]
): CollectionEntry<"docs">[] {
  return [...entries].sort((a, b) => {
    const ta = postTime(a);
    const tb = postTime(b);
    const da = blogEntryBaseId(a.id);
    const db = blogEntryBaseId(b.id);
    if (ta === null && tb === null) return da.localeCompare(db);
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });
}

export async function getBlogPostsSorted(): Promise<CollectionEntry<"docs">[]> {
  const all = await getCollection("docs");
  return sortBlogPostsNewestFirst(all.filter(isBlogPost));
}

/** URL pathname for a docs entry, matching Starlight’s `slugToPathname` (e.g. `blog/index` → `/blog/`). */
export function docIdToPathname(id: string): string {
  const slug = blogEntryBaseId(id);
  const param =
    slug === "index" || slug === "" || slug === "/"
      ? undefined
      : (slug.endsWith("/index") ? slug.slice(0, -6) : slug).normalize();
  return param ? `/${String(param)}/` : `/`;
}
