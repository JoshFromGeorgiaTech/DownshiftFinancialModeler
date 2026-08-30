export function fmtMoney(n: number, compact = false): string {
  if (compact) {
    if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
    if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}K`;
    return `$${Math.round(n)}`;
  }
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
