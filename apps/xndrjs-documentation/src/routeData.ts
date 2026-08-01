import { defineRouteMiddleware } from "@astrojs/starlight/route-data";
import { isBlogAreaRoute, isBlogIndexRoute } from "./utils/blog-posts";

export const onRequest = defineRouteMiddleware(async (context, next) => {
  await next();

  const route = context.locals.starlightRoute;
  const isBlogTagPage = context.url.pathname.startsWith("/blog/tag/");

  if (!isBlogAreaRoute(route.id) && !isBlogTagPage) return;

  route.hasSidebar = false;

  if (isBlogIndexRoute(route.id) || isBlogTagPage) {
    route.toc = undefined;
  }
});
