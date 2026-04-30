import { getSidebarData, type SidebarItem } from "./sidebar";

export interface NavigationPage {
  title: string;
  slug: string;
}

/**
 * Flattens the sidebar structure into a linear list of pages
 */
function flattenSidebar(items: SidebarItem[]): NavigationPage[] {
  const pages: NavigationPage[] = [];

  for (const item of items) {
    if (item.children && item.children.length > 0) {
      // Recursively flatten children
      pages.push(...flattenSidebar(item.children));
    } else {
      // Leaf node - add to pages
      pages.push({
        title: item.title,
        slug: item.slug,
      });
    }
  }

  return pages;
}

/**
 * Finds the previous and next pages relative to the current page
 */
export async function getNavigationPages(
  currentSlug: string
): Promise<{ previous: NavigationPage | null; next: NavigationPage | null }> {
  const sidebarData = await getSidebarData();
  const allPages = flattenSidebar(sidebarData);

  // Find current page index
  const currentIndex = allPages.findIndex((page) => page.slug === currentSlug);

  if (currentIndex === -1) {
    return { previous: null, next: null };
  }

  return {
    previous: currentIndex > 0 ? allPages[currentIndex - 1] : null,
    next: currentIndex < allPages.length - 1 ? allPages[currentIndex + 1] : null,
  };
}
