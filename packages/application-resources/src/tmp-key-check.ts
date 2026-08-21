import { defineAri, s } from "./index";

const cmsEntryAri = defineAri("cms.entry", s.object({ id: s.string() }));
const resource = cmsEntryAri({ id: "x" });

// Expect key[0].id to be string
const id: string = resource.key[0].id;

declare const wide: import("./types").ApplicationResourceIdentifier;
if (cmsEntryAri.matches(wide)) {
  const id2: string = wide.key[0].id;
}
