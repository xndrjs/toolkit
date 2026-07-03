export type LocaleFallbackMap = Record<string, string | null>;

export interface ResolvedLocaleTemplate {
  template: string;
  resolvedLocale: string;
  fallbackChain: readonly string[];
}

export function validateLocaleFallback(map: LocaleFallbackMap): void {
  for (const startLocale of Object.keys(map)) {
    const visited = new Set<string>();
    let current: string | undefined = startLocale;

    while (current !== undefined) {
      if (visited.has(current)) {
        throw new Error(`[i18n] Circular locale fallback detected involving "${current}"`);
      }
      visited.add(current);

      const next: string | null | undefined = map[current];
      if (next === undefined || next === null) {
        break;
      }
      current = next;
    }
  }
}

export function resolveLocaleTemplate(
  localeByKey: Record<string, string | undefined> | undefined,
  requestedLocale: string,
  fallbackMap?: LocaleFallbackMap
): ResolvedLocaleTemplate | undefined {
  const chain: string[] = [requestedLocale];
  let currentLocale = requestedLocale;

  while (true) {
    const template = localeByKey?.[currentLocale];
    if (template !== undefined) {
      return { template, resolvedLocale: currentLocale, fallbackChain: chain };
    }

    if (!fallbackMap) {
      return undefined;
    }

    const fallback = fallbackMap[currentLocale];
    if (fallback === undefined || fallback === null) {
      return undefined;
    }

    if (chain.includes(fallback)) {
      throw new Error(
        `[i18n] Circular locale fallback detected: ${[...chain, fallback].join(" → ")}`
      );
    }

    chain.push(fallback);
    currentLocale = fallback;
  }
}

export function formatLocaleFallbackChain(
  requestedLocale: string,
  fallbackMap?: LocaleFallbackMap
): string {
  if (!fallbackMap) {
    return requestedLocale;
  }

  const chain: string[] = [requestedLocale];
  let current = requestedLocale;

  while (true) {
    const fallback = fallbackMap[current];
    if (fallback === undefined || fallback === null) {
      break;
    }
    if (chain.includes(fallback)) {
      chain.push(fallback);
      break;
    }
    chain.push(fallback);
    current = fallback;
  }

  return chain.join(" → ");
}
