import { getCollection } from "astro:content";

export interface SidebarItem {
  title: string;
  slug: string;
  order?: number;
  children?: SidebarItem[];
}

export async function getSidebarData(): Promise<SidebarItem[]> {
  const docs = await getCollection("docs");

  // Group by category
  const categories: Record<string, SidebarItem[]> = {};

  for (const doc of docs) {
    const pathParts = doc.id.split("/");
    const category = pathParts[0];

    if (!categories[category]) {
      categories[category] = [];
    }

    const order = doc.data.order ?? 999;
    // Remove .md extension from slug if present
    const slug = doc.id.replace(/\.md$/, "");
    categories[category].push({
      title: doc.data.title,
      slug,
      order,
    });
  }

  // Sort within each category
  for (const category in categories) {
    categories[category].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }

  // Build sidebar structure
  const sidebar: SidebarItem[] = [];

  // Getting Started
  if (categories["getting-started"]) {
    sidebar.push({
      title: "Getting Started",
      slug: "getting-started",
      children: categories["getting-started"],
    });
  }

  // Domain
  if (categories["domain"]) {
    sidebar.push({
      title: "Domain",
      slug: "domain",
      children: categories["domain"],
    });
  }

  // Adapters
  if (categories["adapters"]) {
    const adapterSubcats: Record<string, SidebarItem[]> = {};
    for (const item of categories["adapters"]) {
      const subcat = item.slug.split("/")[1];
      if (!adapterSubcats[subcat]) {
        adapterSubcats[subcat] = [];
      }
      adapterSubcats[subcat].push(item);
    }

    const adapters: SidebarItem[] = [];
    for (const [subcat, items] of Object.entries(adapterSubcats)) {
      adapters.push({
        title: subcat.charAt(0).toUpperCase() + subcat.slice(1),
        slug: `adapters/${subcat}`,
        children: items,
      });
    }

    sidebar.push({
      title: "Adapters",
      slug: "adapters",
      children: adapters,
    });
  }

  // Benchmarks
  if (categories["benchmarks"]) {
    sidebar.push({
      title: "Benchmarks",
      slug: "benchmarks",
      children: categories["benchmarks"],
    });
  }

  return sidebar;
}
