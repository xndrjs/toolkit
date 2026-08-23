"use server";

import { revalidatePath } from "next/cache";

import { lruIslandCache } from "../../src/infrastructure/cache/index";

/** Drops every island from the process-wide LRU demo cache. */
export async function clearIslandCache(): Promise<void> {
  lruIslandCache.clear();
  revalidatePath("/", "layout");
}
