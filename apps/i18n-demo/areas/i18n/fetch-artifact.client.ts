"use client";

import type { FetchArtifact } from "@xndrjs/i18n";
import { areasArtifactFileName } from "./artifact-path";

const PUBLIC_BASE = "/i18n/translations";

/**
 * Browser `fetchImpl`: HTTP GET against Next `public/i18n/translations`.
 */
export const areasFetchArtifact: FetchArtifact = async (id) => {
  if (typeof window === "undefined") {
    throw new Error("[i18n-demo/areas] Client fetchImpl must not run on the server.");
  }

  const url = `${PUBLIC_BASE}/${areasArtifactFileName(id)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `[i18n-demo/areas] Failed to fetch "${url}" (${response.status} ${response.statusText}).`
    );
  }
  return response.json();
};
