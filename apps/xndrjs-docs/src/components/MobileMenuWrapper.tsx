import { useState, useEffect } from "react";
import MobileMenu from "./MobileMenu";
import type { SidebarItem } from "../utils/sidebar";
import styles from "./MobileMenuWrapper.module.css";

interface MobileMenuWrapperProps {
  sidebarData: SidebarItem[];
}

export default function MobileMenuWrapper({ sidebarData }: MobileMenuWrapperProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 996);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <>
      {isMobile && !isOpen && (
        <button
          className={styles.hamburger}
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Open menu"
          aria-expanded={isOpen}
          type="button"
        >
          <span className={styles.hamburgerLine}></span>
          <span className={styles.hamburgerLine}></span>
          <span className={styles.hamburgerLine}></span>
        </button>
      )}
      <MobileMenu isOpen={isOpen} onClose={() => setIsOpen(false)} sidebarData={sidebarData} />
    </>
  );
}
