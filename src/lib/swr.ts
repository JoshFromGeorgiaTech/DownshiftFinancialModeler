// Safe withdrawal rate as a function of how many years the money must last.
// Anchors from the literature: Bengen's original 4% was calibrated to a 30-year
// horizon; ~3.5% is the "absolute safe" rate that survived 50-year periods
// historically; 3.25-3.5% is the common recommendation for 40+ year FIRE horizons.
// Shorter horizons support materially more.
export const SWR_ANCHORS: [number, number][] = [[10, 7.5], [20, 4.8], [30, 4.0], [40, 3.6], [50, 3.4], [60, 3.3]];

export function swrForHorizon(years: number): number {
  if (years <= SWR_ANCHORS[0][0]) return SWR_ANCHORS[0][1];
  const last = SWR_ANCHORS[SWR_ANCHORS.length - 1];
  if (years >= last[0]) return last[1];
  for (let i = 0; i < SWR_ANCHORS.length - 1; i++) {
    const [y0, r0] = SWR_ANCHORS[i], [y1, r1] = SWR_ANCHORS[i + 1];
    if (years >= y0 && years <= y1) return r0 + (r1 - r0) * ((years - y0) / (y1 - y0));
  }
  return last[1];
}
