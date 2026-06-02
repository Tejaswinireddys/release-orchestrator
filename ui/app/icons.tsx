export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Release Orchestrator">
      <rect x="2" y="2" width="28" height="28" rx="8" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M16 6 L16 26" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="9" r="3" fill="#3b82f6" />
      <circle cx="16" cy="16" r="3" fill="#22d3ee" />
      <circle cx="16" cy="23" r="3" fill="#2dd4bf" />
      <path d="M16 9 L24 9 M16 16 L24 16 M16 23 L8 23" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}

type IconProps = { size?: number; color?: string };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none" as const });

export function IconPackage({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z" />
      <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
    </svg>
  );
}
export function IconDocker({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="10" width="3" height="3" /><rect x="7" y="10" width="3" height="3" />
      <rect x="11" y="10" width="3" height="3" /><rect x="7" y="6" width="3" height="3" />
      <path d="M2 13h16c0 3-2 5-6 5H8c-3 0-6-2-6-5z" />
    </svg>
  );
}
export function IconDoc({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
    </svg>
  );
}
export function IconTicket({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M13 7v10" strokeDasharray="2 2" />
    </svg>
  );
}
export function IconRocket({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8a2 2 0 0 0-3 0z" />
      <path d="M12 15 9 12c1-4 4-8 10-9 1 6-3 9-7 10z" />
      <path d="M9 12H5s.5-3 3-4M12 15v4s3-.5 4-3" />
    </svg>
  );
}
export function IconHome({ size = 16 }: IconProps) {
  return <svg {...base(size)} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>;
}
export function IconHistory({ size = 16 }: IconProps) {
  return <svg {...base(size)} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>;
}
export function IconCog({ size = 16 }: IconProps) {
  return <svg {...base(size)} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.2 6.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>;
}
export function IconCheck({ size = 14 }: IconProps) {
  return <svg {...base(size)} stroke="#34d399" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}
export function IconX({ size = 14 }: IconProps) {
  return <svg {...base(size)} stroke="#f87171" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
}
export function IconArrow({ size = 16 }: IconProps) {
  return <svg {...base(size)} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
