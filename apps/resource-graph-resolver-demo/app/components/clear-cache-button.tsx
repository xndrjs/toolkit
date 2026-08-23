import { clearIslandCache } from "../actions/clear-island-cache";

/** Server form that resets the in-memory island LRU and refreshes the page. */
export function ClearCacheButton() {
  return (
    <form action={clearIslandCache}>
      <button type="submit" className="copy-button">
        Clear cache
      </button>
    </form>
  );
}
