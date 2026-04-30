import { useState, useEffect } from "react";
import type { SidebarItem } from "../utils/sidebar";
import styles from "./MobileMenu.module.css";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  sidebarData: SidebarItem[];
}

export default function MobileMenu({ isOpen, onClose, sidebarData }: MobileMenuProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 996);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (isOpen && isMobile) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, isMobile]);

  if (!isMobile) {
    return null;
  }

  // Remove arrows and path prefixes from titles
  const cleanTitle = (title: string): string => {
    const parts = title.split("→");
    return parts.length > 1 ? parts[parts.length - 1].trim() : title.trim();
  };

  const renderItem = (item: SidebarItem, level = 0) => {
    const cleanItemTitle = cleanTitle(item.title);
    const basePadding = 1.5; // Padding base in rem
    const indentPerLevel = 1; // 1rem per ogni livello (ridotto da 1.5rem)
    const totalIndent = basePadding + level * indentPerLevel;

    if (item.children && item.children.length > 0) {
      return (
        <li key={item.slug} className={styles.mobileMenuItem}>
          <div className={styles.mobileMenuCategory} style={{ paddingLeft: `${totalIndent}rem` }}>
            {cleanItemTitle}
          </div>
          <ul className={styles.mobileMenuSublist}>
            {item.children.map((child) => renderItem(child, level + 1))}
          </ul>
        </li>
      );
    }
    return (
      <li key={item.slug} className={styles.mobileMenuItem}>
        <a
          href={`/docs/${item.slug}`}
          className={styles.mobileMenuLink}
          onClick={onClose}
          style={{ paddingLeft: `${totalIndent}rem` }}
        >
          {cleanItemTitle}
        </a>
      </li>
    );
  };

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} aria-hidden="true" />}
      <nav
        className={`${styles.mobileMenu} ${isOpen ? styles.mobileMenuOpen : ""}`}
        aria-hidden={!isOpen}
      >
        <div className={styles.mobileMenuHeader}>
          <a href="/" className={styles.mobileMenuBrand} onClick={onClose}>
            <img src="/img/logo-squared.svg" alt="xndr" className={styles.mobileMenuLogo} />
            <span className={styles.mobileMenuTitle}>xndr</span>
          </a>
          <button className={styles.mobileMenuClose} onClick={onClose} aria-label="Close menu">
            ×
          </button>
        </div>
        <div className={styles.mobileMenuContent}>
          <ul className={styles.mobileMenuList}>{sidebarData.map((item) => renderItem(item))}</ul>
        </div>
      </nav>
    </>
  );
}
