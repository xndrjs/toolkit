import { defineMiddleware } from "astro:middleware";

import { latestDocPrefix } from "../doc-routing.mjs";

/**
 * Maps `/latest` and `/latest/...` to the current default docs tree (see `doc-routing.mjs`).
 * Runs in dev / SSR; static production relies on `_redirects` emitted at build time.
 */
export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = context.url;
  if (pathname === "/latest" || pathname === "/latest/" || pathname.startsWith("/latest/")) {
    const tail =
      pathname === "/latest" || pathname === "/latest/" ? "/" : pathname.slice("/latest".length);
    const targetPath = `/${latestDocPrefix}${tail.startsWith("/") ? tail : `/${tail}`}`;
    return context.redirect(`${targetPath}${context.url.search}`, 302);
  }
  return next();
});
