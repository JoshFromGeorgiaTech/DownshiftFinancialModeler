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

export function WarningMarker({ cx, cy, fill }: MarkerProps) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={15} fill={fill} opacity={0.18} />
      <path
        d={`M ${cx} ${cy - 13} L ${cx + 11} ${cy + 9} L ${cx - 11} ${cy + 9} Z`}
        fill={fill}
        stroke={colors.bg}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <line x1={cx} y1={cy - 4} x2={cx} y2={cy + 1.5} stroke={colors.bg} strokeWidth={2} strokeLinecap="round" />
      <circle cx={cx} cy={cy + 5.5} r={1.4} fill={colors.bg} />
    </g>
  );
}
