import styles from "./HomepageHeader.module.css";

export default function HomepageHeader() {
  return (
    <header className={styles.heroBanner}>
      <div className={styles.heroBackground}></div>
      <div className={styles.heroContainer}>
        <h1 className={styles.heroTitle}>xndrjs</h1>
        <p className={styles.heroTagline}>Typed trust boundaries for plain immutable data</p>
      </div>
    </header>
  );
}
