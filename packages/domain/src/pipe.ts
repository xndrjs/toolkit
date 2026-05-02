export type Unary<A, B> = (input: A) => B;

/**
 * Fully typed pipe: composes unary transforms.
 */
export function pipe<A>(value: A): A;
export function pipe<A, B>(value: A, ab: Unary<A, B>): B;
export function pipe<A, B, C>(value: A, ab: Unary<A, B>, bc: Unary<B, C>): C;
export function pipe<A, B, C, D>(value: A, ab: Unary<A, B>, bc: Unary<B, C>, cd: Unary<C, D>): D;
export function pipe<A, B, C, D, E>(
  value: A,
  ab: Unary<A, B>,
  bc: Unary<B, C>,
  cd: Unary<C, D>,
  de: Unary<D, E>
): E;
export function pipe<A, B, C, D, E, F>(
  value: A,
  ab: Unary<A, B>,
  bc: Unary<B, C>,
  cd: Unary<C, D>,
  de: Unary<D, E>,
  ef: Unary<E, F>
): F;
export function pipe<A, B, C, D, E, F, G>(
  value: A,
  ab: Unary<A, B>,
  bc: Unary<B, C>,
  cd: Unary<C, D>,
  de: Unary<D, E>,
  ef: Unary<E, F>,
  fg: Unary<F, G>
): G;
export function pipe(value: unknown, ...fns: ((input: unknown) => unknown)[]): unknown {
  return fns.reduce((acc, fn) => fn(acc), value);
}
