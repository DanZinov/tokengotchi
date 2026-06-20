// Compact big-number formatting for the deep game: 1234 → "1.2K", 4.2e9 → "4.2B".
// Display-only; the engine always works in raw numbers.

const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

export function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const neg = n < 0;
  let v = Math.abs(n);
  if (v < 1000) {
    const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
    return neg ? "-" + s : s;
  }
  let i = 0;
  while (v >= 1000 && i < SUFFIXES.length - 1) {
    v /= 1000;
    i++;
  }
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  return (neg ? "-" : "") + v.toFixed(digits) + SUFFIXES[i];
}
