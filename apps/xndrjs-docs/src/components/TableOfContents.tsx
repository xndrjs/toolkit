import { useEffect, useState } from "react";
import styles from "./TableOfContents.module.css";

interface Heading {
  id: string;
  text: string;
  level: number;
}

export default function TableOfContents() {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const article = document.querySelector(".doc-article");
    if (!article) return;

    const headingElements = article.querySelectorAll("h2, h3, h4");
    const headingData: Heading[] = Array.from(headingElements).map((el) => ({
      id: el.id || el.textContent?.toLowerCase().replace(/\s+/g, "-") || "",
      text: el.textContent || "",
      level: parseInt(el.tagName.charAt(1)),
    }));

    setHeadings(headingData);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-100px 0px -66%" }
    );

    headingElements.forEach((el) => observer.observe(el));

    return () => {
      headingElements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  if (headings.length === 0) {
    return null;
  }

  return (
    <nav className={styles.tableOfContents} aria-label="Table of contents">
      <ul className={styles.list}>
        {headings.map((heading) => (
          <li
            key={heading.id}
            className={`${styles.item} ${styles[`item--depth-${heading.level}`]} ${
              activeId === heading.id ? styles.active : ""
            }`}
          >
            <a
              href={`#${heading.id}`}
              className={`${styles.link} ${activeId === heading.id ? styles.active : ""}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(heading.id)?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
