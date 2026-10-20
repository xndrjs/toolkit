/**
 * Split an identifier into lowercase words.
 * Accepts camelCase, PascalCase, kebab-case, snake_case, and spaced phrases.
 */
export function words(input: string): string[] {
  return input
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_\-./]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
}

function capitalize(word: string): string {
  if (word.length === 0) {
    return word;
  }
  return `${word[0]!.toUpperCase()}${word.slice(1)}`;
}

/** `oneBigDog` → `OneBigDog` */
export function toPascalCase(input: string): string {
  return words(input).map(capitalize).join("");
}

/** `OneBigDog` → `one-big-dog` */
export function toKebabCase(input: string): string {
  return words(input).join("-");
}

/** `OneBigDog` → `one_big_dog` */
export function toSnakeCase(input: string): string {
  return words(input).join("_");
}

/** `OneBigDog` → `oneBigDog` */
export function toCamelCase(input: string): string {
  const parts = words(input);
  if (parts.length === 0) {
    return "";
  }
  const [first, ...rest] = parts;
  return `${first}${rest.map(capitalize).join("")}`;
}

/** `oneBigDog` → `One Big Dog` */
export function toTitleCase(input: string): string {
  return words(input).map(capitalize).join(" ");
}

/** `oneBigDog` → `One big dog` */
export function toSentenceCase(input: string): string {
  const parts = words(input);
  if (parts.length === 0) {
    return "";
  }
  const [first, ...rest] = parts;
  return [capitalize(first!), ...rest].join(" ");
}
