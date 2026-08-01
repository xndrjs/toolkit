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

/** Starlight docs route id is the blog index (`blog` or `blog/index`). */
export function isBlogIndexRoute(docId: string): boolean {
  return isBlogIndexBase(blogEntryBaseId(docId));
}

/** Starlight docs route id is a single blog post (not the index). */
export function isBlogPostRoute(docId: string): boolean {
  const base = blogEntryBaseId(docId);
  return base.startsWith("blog/") && !isBlogIndexBase(base);
}

export function formatBlogDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

/** Adjacent posts in reading order (prev = older, next = newer). Assumes `posts` is newest-first. */
export function getBlogPostNeighbors(
  currentDocId: string,
  posts: CollectionEntry<"docs">[]
): {
  prev: CollectionEntry<"docs"> | undefined;
  next: CollectionEntry<"docs"> | undefined;
} {
  const currentBase = blogEntryBaseId(currentDocId);
  const index = posts.findIndex((entry) => blogEntryBaseId(entry.id) === currentBase);
  if (index === -1) return { prev: undefined, next: undefined };
  return {
    prev: posts[index + 1],
    next: posts[index - 1],
  };
}

export function blogPostTitle(entry: CollectionEntry<"docs">): string {
  const title = entry.data.title;
  if (typeof title === "string" && title.length > 0) return title;
  return blogEntryBaseId(entry.id);
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

/** URL-safe slug for a blog tag label (display string stays as authored). */
export function slugifyBlogTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");
}

export function blogTagPathname(tag: string): string {
  return `/blog/tag/${slugifyBlogTag(tag)}/`;
}

export function getEntryBlogTags(entry: CollectionEntry<"docs">): string[] {
  const tags = entry.data.tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
}

export function entryHasBlogTagSlug(entry: CollectionEntry<"docs">, tagSlug: string): boolean {
  return getEntryBlogTags(entry).some((tag) => slugifyBlogTag(tag) === tagSlug);
}

export type BlogTagSummary = {
  label: string;
  slug: string;
  count: number;
};

/** Unique tags across posts, newest-label wins for casing; sorted by label. */
export async function getAllBlogTags(): Promise<BlogTagSummary[]> {
  const posts = await getBlogPostsSorted();
  const bySlug = new Map<string, BlogTagSummary>();

  for (const entry of posts) {
    for (const label of getEntryBlogTags(entry)) {
      const slug = slugifyBlogTag(label);
      if (!slug) continue;
      const existing = bySlug.get(slug);
      if (existing) {
        existing.count += 1;
      } else {
        bySlug.set(slug, { label, slug, count: 1 });
      }
    }
  }

  return [...bySlug.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export async function getBlogPostsByTagSlug(
  tagSlug: string
): Promise<{ tag: BlogTagSummary | undefined; posts: CollectionEntry<"docs">[] }> {
  const tags = await getAllBlogTags();
  const tag = tags.find((t) => t.slug === tagSlug);
  if (!tag) return { tag: undefined, posts: [] };
  const posts = await getBlogPostsSorted();
  return {
    tag,
    posts: posts.filter((entry) => entryHasBlogTagSlug(entry, tagSlug)),
  };
}
