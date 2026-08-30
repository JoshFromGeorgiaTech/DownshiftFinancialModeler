import { colors } from "../lib/colors.js";

// recharts passes many more fields to custom `shape` renderers than we use;
// only cx/cy/fill matter here.
interface MarkerProps {
  cx: number;
  cy: number;
  fill: string;
}

export function DiamondMarker({ cx, cy, fill }: MarkerProps) {
  return <rect x={cx - 4} y={cy - 4} width={8} height={8} fill={colors.bg} stroke={fill} strokeWidth={2} transform={`rotate(45 ${cx} ${cy})`} />;
}

export function SquareMarker({ cx, cy, fill }: MarkerProps) {
  return <rect x={cx - 5} y={cy - 5} width={10} height={10} fill={fill} stroke={colors.bg} strokeWidth={2} />;
}
