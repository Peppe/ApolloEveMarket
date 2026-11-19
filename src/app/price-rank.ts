export function priceRank(
  value: number | null,
  prices: readonly (number | null)[],
): number | null {
  if (value === null) return null;
  const ordered = prices
    .filter((price): price is number => price !== null)
    .sort((a, b) => b - a);
  const firstPlace = ordered.indexOf(value);
  if (firstPlace === -1) return null;

  const lastPlace = ordered.lastIndexOf(value);
  const averagePlace = (firstPlace + lastPlace) / 2;
  const scaledRank =
    ordered.length === 1 ? 3 : 1 + (averagePlace / (ordered.length - 1)) * 4;
  return Math.round(scaledRank);
}
