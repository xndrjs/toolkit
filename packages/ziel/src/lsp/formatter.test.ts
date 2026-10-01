import { EmptyFileSystem, URI } from "langium";
import { describe, expect, it } from "vitest";
import type { TextEdit } from "vscode-languageserver";

import { isModel, type Model } from "../lang/generated/ast";
import { createZielLspServices } from "./create-services";

function parseDocument(source: string, uri = "inmemory:///format.ziel") {
  const { shared, Ziel } = createZielLspServices(EmptyFileSystem);
  const document = shared.workspace.LangiumDocumentFactory.fromString<Model>(
    source,
    URI.parse(uri)
  );
  expect(document.parseResult.lexerErrors).toEqual([]);
  expect(document.parseResult.parserErrors).toEqual([]);
  expect(isModel(document.parseResult.value)).toBe(true);
  return { document, formatter: Ziel.lsp.Formatter! };
}

/** Apply LSP text edits (must be applied from end → start so offsets stay valid). */
function applyEdits(source: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return b.range.start.line - a.range.start.line;
    }
    return b.range.start.character - a.range.start.character;
  });

  let text = source;
  for (const edit of sorted) {
    const start = offsetAt(text, edit.range.start.line, edit.range.start.character);
    const end = offsetAt(text, edit.range.end.line, edit.range.end.character);
    text = text.slice(0, start) + edit.newText + text.slice(end);
  }
  return text;
}

function offsetAt(text: string, line: number, character: number): number {
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < line; i++) {
    offset += (lines[i]?.length ?? 0) + 1;
  }
  return offset + character;
}

async function formatSource(source: string): Promise<string> {
  const { document, formatter } = parseDocument(source);
  const edits = await formatter.formatDocument(document, {
    textDocument: { uri: document.uri.toString() },
    options: { tabSize: 2, insertSpaces: true },
  });
  return applyEdits(source, edits);
}

describe("ZielFormatter", () => {
  it("indents query / resource blocks and spaces operators", async () => {
    const messy = `
scalar EntryId on string;
resource Entry(id:EntryId):{id title:string}
query Q(id:EntryId, locale: string){
context{
    locale
  }
root Entry(id:id)
on Entry e{
id
when e.type=="Hero"{title}
default { }
}
islands{
on Entry e when e.type=="Menu" or e.type=="Footer"
}
}
`.trim();

    const formatted = await formatSource(messy);

    expect(formatted).toContain("resource Entry(id: EntryId): {");
    expect(formatted).toContain("query Q(\n  id: EntryId,\n  locale: string\n) {");
    expect(formatted).toContain("context {");
    expect(formatted).toContain("on Entry e {");
    expect(formatted).toContain('when e.type == "Hero" {');
    expect(formatted).toContain("islands {");
    // Interior of braces should be indented
    expect(formatted).toMatch(/\n {2}context \{/);
    expect(formatted).toMatch(/\n {2}on Entry e \{/);
    expect(formatted).toMatch(/\n {2}islands \{/);
    // Blank line between query sections
    expect(formatted).toMatch(/context \{[\s\S]*?\}\n\n {2}root /);
    expect(formatted).toMatch(/root Entry\(id: id\)\n\n {2}on Entry e \{/);
  });

  it("puts a blank line between top-level declarations", async () => {
    const messy = `scalar A on string;
scalar B on string;
resource R(id:A): { id }`;

    const formatted = await formatSource(messy);
    expect(formatted).toContain("scalar A on string;\n\nscalar B on string;");
    expect(formatted).toContain("scalar B on string;\n\nresource R");
  });

  it("wraps multi-parameter query signatures", async () => {
    const messy = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id:EntryId):{id}
query Q(id:EntryId, spaceId: string, locale: Locale){
root Entry(id:id)
on Entry e{id}
}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toContain(
      "query Q(\n  id: EntryId,\n  spaceId: string,\n  locale: Locale\n) {"
    );
  });

  it("keeps single-parameter query signatures inline", async () => {
    const messy = `
scalar Id on string;
resource Entry(id:Id):{id}
query Q(id:Id){
root Entry(id:id)
on Entry e{id}
}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toContain("query Q(id: Id) {");
  });

  it("formats each-expand and wraps multi-arg constructions", async () => {
    const messy = `
scalar Id on string;
resource Page(id:Id):{strips:{id:Id}[]}
resource Entry(id:Id):{id}
query Q(id:Id){
root Page(id:id)
on Page p{
expand strips:each link in p.strips(Entry(id:link.id))
expand menu:Entry(spaceId:a,environmentId:b,id:p.menuId,locale:c)
}
}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toContain("expand strips: each link in p.strips (");
    expect(formatted).toMatch(/each link in p\.strips \(\n {6}Entry\(id: link\.id\)\n {4}\)/);
    expect(formatted).toMatch(
      /Entry\(\n {6}spaceId: a,\n {6}environmentId: b,\n {6}id: p\.menuId,\n {6}locale: c\n {4}\)/
    );
    // Blank line between sibling expands
    expect(formatted).toMatch(/expand strips:[\s\S]*?\n\n {4}expand menu:/);
  });

  it("formats ! and array membership", async () => {
    const messy = `
scalar Id on string;
resource Entry(id:Id):{type:string visible:boolean}
query Q(id:Id){
root Entry(id:id)
on Entry e{
when !e.visible{id}
when e.type in["A","B"]{id}
default { }
}
}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toContain("when !e.visible {");
    expect(formatted).toContain('when e.type in ["A", "B"] {');
    // Blank line between when arms
    expect(formatted).toMatch(/when !e\.visible \{[\s\S]*?\}\n\n {4}when e\.type in/);
  });

  it("formats scalar erase casts with spaces around as", async () => {
    const messy = `
scalar Locale on string;
scalar Ref on string;
resource CustomReference(ref:Ref):{ref}
datasource Cms{
context{locale:Locale}
for CustomReference c when context.locale as string==@c.ref as string
}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toContain("locale as string == @c.ref as string");
  });

  it("breaks and/or onto separate lines", async () => {
    const messy = `
scalar Id on string;
resource Entry(id:Id):{type:string}
query Q(id:Id){
root Entry(id:id)
islands{
on Entry e when e.type=="Menu" or e.type=="Footer" and e.type!="X"
}
}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toMatch(/e\.type == "Menu"\n {6}or e\.type == "Footer"/);
    expect(formatted).toMatch(/e\.type == "Footer"\n {6}and e\.type != "X"/);
  });

  it("breaks object-union pipes onto leading-pipe lines; keeps atomic unions inline", async () => {
    const messy = `
scalar Id on string;
resource Entry(id:Id):{kind:"Hero" id}|{kind:"Footer" id cta:string}|{kind:"Page" id}
resource Asset(id:Id):{kind:"Asset" asset_type:"image"|"video"|"document"}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toMatch(
      /Entry\(id: Id\):\n {2}\{\n {4}kind: "Hero"\n {4}id\n {2}\}\n {2}\| \{\n {4}kind: "Footer"/
    );
    // No staircase: every leading pipe shares the same column.
    expect(formatted).toMatch(
      /\n {2}\| \{\n {4}kind: "Footer"[\s\S]*?\n {2}\}\n {2}\| \{\n {4}kind: "Page"/
    );
    expect(formatted).not.toMatch(/\n {4}\| \{/);
    expect(formatted).toContain('asset_type: "image" | "video" | "document"');
    expect(formatted).not.toMatch(/"image"\n\s+\| "video"/);
  });

  it("formats empty when arms and empty include clauses as { }", async () => {
    const messy = `
scalar Id on string;
resource Entry(id:Id):{type:string id}
resource Asset(id:Id):{id}
query Q(id:Id){
root Entry(id:id)
on Entry e{
when e.type=="Page"{
}
when e.type=="Hero"{title}
default { }
}
on Asset a include properties{
}
}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toContain('when e.type == "Page" { }');
    expect(formatted).not.toMatch(/when e\.type == "Page" \{\s*\n\s*\}/);
    expect(formatted).toMatch(/when e\.type == "Hero" \{\n {6}title\n {4}\}/);
    expect(formatted).toContain("on Asset a include properties { }");
  });

  it("spaces include on when arms before {", async () => {
    const messy = `
scalar Id on string;
resource Entry(id:Id):{type:string title:string}
query Q(id:Id){
root Entry(id:id)
on Entry e{
when e.type=="Hero"include properties{title}
when e.type=="Page"include all{}
when e.type=="Menu"include none{title}
default { }
}
}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toContain('when e.type == "Hero" include properties {');
    expect(formatted).toContain('when e.type == "Page" include all { }');
    expect(formatted).toContain('when e.type == "Menu" include none {');
  });

  it("spaces fragment when before { (no include on fragments)", async () => {
    const messy = `
scalar Id on string;
resource Entry(id:Id):{type:string title:string logoId:string}
fragment MenuOnly on Entry e when e.type=="Menu"{logoId}
fragment Plain on Entry e{title}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toContain('fragment MenuOnly on Entry e when e.type == "Menu" {');
    expect(formatted).toContain("fragment Plain on Entry e {");
    expect(formatted).not.toContain("include");
  });

  it("formats datasource blocks with context and for routes", async () => {
    const messy = `
scalar Locale on string;
scalar EntryId on string;
scalar AssetId on string;
resource Entry(id:EntryId,locale:Locale):{id locale}
resource Asset(id:AssetId,locale:Locale):{id}
datasource CmsSource{
context{locale:Locale}
for Entry e when context.locale==@e.locale
for Asset
}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toContain("datasource CmsSource {");
    expect(formatted).toMatch(/\n {2}context \{/);
    expect(formatted).toMatch(/context \{[\s\S]*?\}\n\n {2}for Entry e when/);
    expect(formatted).toContain("for Entry e when context.locale == @e.locale");
    expect(formatted).toMatch(/\n {2}for Asset\n/);
  });

  it("formats exclude clauses inside include bodies", async () => {
    const messy = `
scalar Id on string;
resource Entry(id:Id):{id title:string imageId:string}
query Q(id:Id){
root Entry(id:id)
on Entry e include all{
exclude imageId
exclude title
}
}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toContain("on Entry e include all {");
    expect(formatted).toMatch(/\n {4}exclude imageId\n {4}exclude title\n/);
  });

  it("formats optional fields and `| null` without extra spaces around `?`", async () => {
    const messy = `
scalar Id on string;
resource Post(id:Id):{id title ?: string subtitle:string|null note ?: string | null}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toContain("title?: string");
    expect(formatted).toContain("subtitle: string | null");
    expect(formatted).toContain("note?: string | null");
    expect(formatted).not.toContain("title ?");
    expect(formatted).not.toContain("?:string");
  });

  it("formats on failure clauses after expand targets and each arms", async () => {
    const messy = `
scalar Id on string;
resource Page(id:Id):{menuId:Id items:{id:Id}[]}
resource Entry(id:Id):{id}
query Q(id:Id){
root Page(id:id)
on Page p{
expand menu:Entry(id:p.menuId)on failure set null
expand items:each link in p.items(Entry(id:link.id)on failure set error)
}
on Entry e{id}
}
`.trim();

    const formatted = await formatSource(messy);
    expect(formatted).toContain("on failure set null");
    expect(formatted).toContain("on failure set error");
    expect(formatted).toMatch(/Entry\(id: p\.menuId\) on failure set null/);
    expect(formatted).toMatch(/Entry\(id: link\.id\) on failure set error/);
  });
});
