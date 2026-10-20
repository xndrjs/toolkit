import { domain } from "@xndrjs/domain-zod";
import { PageShape } from "../models/page.shape";

export const PageCapabilities = domain.capabilities
  .forShapeKit(PageShape)
  .methods(({ patch }) => ({
    // TODO: add capabilities
  }));
