import { describe, it, expect } from "vitest";
import { swrForHorizon, SWR_ANCHORS } from "../src/lib/swr.js";

describe("swrForHorizon", () => {
  it("returns the exact anchor rate at each published anchor year", () => {
    for (const [years, rate] of SWR_ANCHORS) {
      expect(swrForHorizon(years)).toBeCloseTo(rate, 6);
    }
  });

  it("clamps to the shortest anchor's rate below it", () => {
    expect(swrForHorizon(1)).toBe(SWR_ANCHORS[0][1]);
  });

  it("clamps to the longest anchor's rate beyond it", () => {
    expect(swrForHorizon(1000)).toBe(SWR_ANCHORS[SWR_ANCHORS.length - 1][1]);
  });

  it("interpolates linearly between anchors", () => {
    // Halfway between 20y (4.8%) and 30y (4.0%) should be 4.4%
    expect(swrForHorizon(25)).toBeCloseTo(4.4, 6);
  });

  it("is monotonically non-increasing as horizon grows", () => {
    let prev = swrForHorizon(5);
    for (let y = 10; y <= 70; y += 5) {
      const rate = swrForHorizon(y);
      expect(rate).toBeLessThanOrEqual(prev + 1e-9);
      prev = rate;
    }
  });
});
