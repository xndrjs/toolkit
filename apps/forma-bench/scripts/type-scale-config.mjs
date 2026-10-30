export const TYPE_SCALE_SHAPES = [
  { arity: 2, depth: 4 },
  { arity: 2, depth: 5 },
  { arity: 3, depth: 4 },
];

export const GUARDED_TYPE_SCALE_SHAPES = [{ arity: 2, depth: 4 }];

export function providerCount({ arity, depth }) {
  let total = 0;
  for (let level = 0; level <= depth; level += 1) {
    total += arity ** level;
  }
  return total;
}

export function shapeKey({ arity, depth }) {
  return `a${arity}-d${depth}`;
}

export function fixtureFileName(shape) {
  const count = String(providerCount(shape)).padStart(3, "0");
  return `tree-${shapeKey(shape)}-p${count}.ts`;
}
