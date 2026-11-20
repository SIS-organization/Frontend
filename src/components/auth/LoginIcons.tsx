import type { ReactNode, SVGProps } from "react";

// Iconițe desenate pentru pagina de login (stil contur, 24×24, culoare din currentColor).

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function PulseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Icon>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </Icon>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 19.5 6v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function LandmarkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M4 9.5h16" />
      <path d="M6.5 12.5v5M10 12.5v5M14 12.5v5M17.5 12.5v5" />
      <path d="M3.5 20.5h17" />
    </Icon>
  );
}

export function CircleCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </Icon>
  );
}

export function DumbbellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <g transform="rotate(-45 12 12)">
        <path d="M8 12h8" />
        <rect x="5" y="7.5" width="3" height="9" rx="1" />
        <rect x="16" y="7.5" width="3" height="9" rx="1" />
        <path d="M3 10.5v3M21 10.5v3" />
      </g>
    </Icon>
  );
}

export function WavesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0" />
      <path d="M3 12c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0" />
      <path d="M3 16c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0" />
    </Icon>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.5 11A8.5 8.5 0 1 1 13 3.5" />
      <path d="M16.5 12A4.5 4.5 0 1 1 12 7.5" />
      <path d="m12 12 7-7" />
      <path d="M16 5h3v3" />
    </Icon>
  );
}

export function VolleyballIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 12a9 9 0 0 0-1.5-8.9" />
      <path d="M12 12a9 9 0 0 1 8.8 1.8" />
      <path d="M12 12a9 9 0 0 0-7.3 5.5" />
      <path d="M10.5 3.1A9 9 0 0 1 15 15" />
      <path d="M20.8 13.8A9 9 0 0 1 8 15.5" />
    </Icon>
  );
}
