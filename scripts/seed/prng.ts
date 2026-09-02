/**
 * Deterministic PRNG for the product-seeding script. `Math.random()` would make manifests
 * unreproducible — running `inspect` twice with the same `--seed` must generate byte-identical
 * output, since `commit` verifies a manifest hash before writing anything.
 */

/** djb2-style string hash, folded into an unsigned 32-bit int to seed the PRNG. */
export function hashStringToSeed(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

export type Rng = () => number;

/** Mulberry32 — small, fast, and stable across Node versions/platforms. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: build an RNG straight from a string seed (e.g. `${runSeed}:${vendorId}:${index}`). */
export function rngFromString(input: string): Rng {
  return createRng(hashStringToSeed(input));
}

export function rngInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function rngPick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("rngPick: empty list");
  return items[Math.floor(rng() * items.length)];
}

export function rngBool(rng: Rng, trueProbability = 0.5): boolean {
  return rng() < trueProbability;
}
