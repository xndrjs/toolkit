import { useState, useEffect } from "react";
import type { SidebarItem } from "../utils/sidebar";

interface SidebarProps {
  items: SidebarItem[];
  currentPath: string;
}

export default function Sidebar({ items, currentPath }: SidebarProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 996);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Auto-expand sections that contain the active page
  useEffect(() => {
    const activeSections = new Set<string>();

    const findActiveSections = (items: SidebarItem[], parentPath: string[] = []) => {
      for (const item of items) {
        const currentPathParts = [...parentPath, item.slug];
        const fullSlug = currentPathParts.join("/");
        const docPath = `/docs/${fullSlug}`;
        const isActive = currentPath === docPath || currentPath.startsWith(`${docPath}/`);

        if (item.children) {
          // Check if any child is active
          const hasActiveChild = item.children.some((child) => {
            const childPath = `${docPath}/${child.slug}`;
            return currentPath === childPath || currentPath.startsWith(`${childPath}/`);
          });

          if (isActive || hasActiveChild) {
            activeSections.add(fullSlug);
            // Recursively check children
            findActiveSections(item.children, currentPathParts);
          }
        }
      }
    };

    findActiveSections(items);
    setExpandedSections(activeSections);
  }, [currentPath, items]);

  const toggleSection = (slug: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const isActive = (slug: string) => {
    return currentPath === `/docs/${slug}` || currentPath.startsWith(`/docs/${slug}/`);
  };

  const hasActiveChild = (item: SidebarItem): boolean => {
    if (isActive(item.slug)) return true;
    if (item.children) {
      return item.children.some((child) => hasActiveChild(child));
    }
    return false;
  };

  // Remove arrows and path prefixes from titles
  const cleanTitle = (title: string): string => {
    // Remove everything before and including the last "→" if present
    const parts = title.split("→");
    return parts.length > 1 ? parts[parts.length - 1].trim() : title.trim();
  };

  const renderItem = (item: SidebarItem, level = 0, parentPath: string[] = []) => {
    const hasChildren = item.children && item.children.length > 0;
    // If slug already contains '/', it's a full path, use it directly
    // Otherwise, build it from parentPath
    const fullSlug = item.slug.includes("/") ? item.slug : [...parentPath, item.slug].join("/");
    const active = isActive(fullSlug);
    const isExpanded = expandedSections.has(fullSlug);
    const indent = level * 1;
    const cleanItemTitle = cleanTitle(item.title);

    // For building child paths, if current item has a full slug, extract its path parts
    const currentPathParts = item.slug.includes("/")
      ? item.slug.split("/")
      : [...parentPath, item.slug];

    return (
      <li key={fullSlug} className="sidebar-item" style={{ paddingLeft: `${indent}rem` }}>
        {hasChildren ? (
          <>
            <button
              className={`sidebar-category ${active || hasActiveChild(item) ? "active" : ""} ${isExpanded ? "expanded" : ""}`}
              onClick={() => toggleSection(fullSlug)}
              aria-expanded={isExpanded}
            >
              <span className="sidebar-category-icon">▶</span>
              <span className="sidebar-category-label">{cleanItemTitle}</span>
            </button>
            {isExpanded && (
              <ul className="sidebar-sublist">
                {item.children!.map((child) => renderItem(child, level + 1, currentPathParts))}
              </ul>
            )}
          </>
        ) : (
          <a href={`/docs/${fullSlug}`} className={`sidebar-link ${active ? "active" : ""}`}>
            {cleanItemTitle}
          </a>
        )}
      </li>
    );
  };

  return (
    <aside className={`sidebar ${isMobile ? "sidebar-mobile" : ""}`}>
      <nav className="sidebar-nav">
        <ul className="sidebar-list">{items.map((item) => renderItem(item))}</ul>
      </nav>
    </aside>
  );
}
