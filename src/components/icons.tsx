/** Inline stroke icons from the design handoff (24-viewBox, round caps). */

interface IconProps {
  size?: number;
  strokeWidth?: number;
}

function Svg({
  size = 17,
  strokeWidth = 1.7,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function VaultIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h16M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8M4 8l1.5-3.4A1 1 0 0 1 6.4 4h11.2a1 1 0 0 1 .9.6L20 8M10 12h4" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx={11} cy={11} r={6} />
      <path d="M20 20l-4.2-4.2" />
    </Svg>
  );
}

export function GraphIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx={6.5} cy={12.5} r={2.5} />
      <circle cx={13.5} cy={5.5} r={2.5} />
      <circle cx={18} cy={13} r={2.5} />
      <circle cx={14} cy={19} r={2} />
      <path d="M8.5 10.5l3-3.2M13.8 8.4l2.9 2.3M8.3 14.9l4 2.6" />
    </Svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx={16} cy={7} r={2} />
      <circle cx={10} cy={17} r={2} />
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    </Svg>
  );
}

export function NewNoteIcon(props: IconProps) {
  return (
    <Svg size={14} strokeWidth={1.8} {...props}>
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8M13 3l6 6M13 3v6h6M12 12v6M9 15h6" />
    </Svg>
  );
}

export function NewFolderIcon(props: IconProps) {
  return (
    <Svg size={14} strokeWidth={1.8} {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM12 11v4M10 13h4" />
    </Svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Svg size={13} strokeWidth={1.9} {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </Svg>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <Svg size={13} strokeWidth={1.9} {...props}>
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-6-6zM13 3v6h6" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg size={13} strokeWidth={2} {...props}>
      <path d="M7 10l5 5 5-5" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg size={13} strokeWidth={2} {...props}>
      <path d="M10 7l5 5-5 5" />
    </Svg>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <Svg size={15} strokeWidth={1.8} {...props}>
      <circle cx={7.5} cy={15.5} r={3.5} />
      <path d="M10.5 12.5L20 3M16 4l4 4" />
    </Svg>
  );
}

export function WarnIcon(props: IconProps) {
  return (
    <Svg size={15} strokeWidth={1.8} {...props}>
      <path d="M12 3L2.5 20h19L12 3zM12 10v4.5M12 17.5v.01" />
    </Svg>
  );
}

export function MarkdownViewIcon(props: IconProps) {
  return (
    <Svg size={15} strokeWidth={1.9} {...props}>
      <path d="M10 4L8 20M16 4l-2 16M4 9.5h16M4 14.5h16" />
    </Svg>
  );
}

export function RichViewIcon(props: IconProps) {
  return (
    <Svg size={15} strokeWidth={1.9} {...props}>
      <path d="M4 6h16M4 11h11M4 16h14M4 21h8" />
    </Svg>
  );
}

export function SplitViewIcon(props: IconProps) {
  return (
    <Svg size={15} strokeWidth={1.8} {...props}>
      <rect x={3.5} y={5} width={17} height={14} rx={1} />
      <path d="M12 5v14" />
    </Svg>
  );
}
