export function prorateInteger(discount: number, weights: number[]): number[] {
  const safeDiscount = Math.max(0, Math.floor(discount));
  const safeWeights = weights.map((weight) => Math.max(0, Math.floor(weight)));
  const totalWeight = safeWeights.reduce((sum, weight) => sum + weight, 0);

  if (safeDiscount === 0 || safeWeights.length === 0 || totalWeight === 0) {
    return safeWeights.map(() => 0);
  }

  const exactShares = safeWeights.map((weight, index) => {
    const exact = (safeDiscount * weight) / totalWeight;
    const base = Math.floor(exact);
    return { index, base, remainder: exact - base };
  });

  const result = exactShares.map((share) => share.base);
  let remainder =
    safeDiscount - result.reduce((sum, amount) => sum + amount, 0);

  exactShares
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .forEach((share) => {
      if (remainder <= 0) return;
      result[share.index] += 1;
      remainder -= 1;
    });

  return result;
}

export function clampDiscount(amount: number, base: number): number {
  return Math.max(0, Math.min(Math.floor(amount), Math.max(0, Math.floor(base))));
}
