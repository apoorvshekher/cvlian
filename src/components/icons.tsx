/* Crisp inline SVG icons (stroke = currentColor) shared across the UI. */
import type { ReactNode } from "react";

function Svg({ children, viewBox = "0 0 16 16" }: { children: ReactNode; viewBox?: string }) {
  return (
    <svg className="icon" viewBox={viewBox} aria-hidden="true">
      {children}
    </svg>
  );
}

export const ChevronUpIcon = () => (
  <Svg><path d="M4 10l4-4 4 4" /></Svg>
);

export const ChevronDownIcon = () => (
  <Svg><path d="M4 6l4 4 4-4" /></Svg>
);

export const ChevronRightIcon = () => (
  <Svg><path d="M6 4l4 4-4 4" /></Svg>
);

export const ChevronLeftIcon = () => (
  <Svg><path d="M10 4L6 8l4 4" /></Svg>
);

/* something worth a second look */
export const AlertIcon = () => (
  <Svg>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 5v3.4M8 10.9v.01" />
  </Svg>
);

/* a page with a tick: the page check beside the preview */
export const PageCheckIcon = () => (
  <Svg>
    <path d="M4 1.8h5.2L12 4.6v9c0 .3-.3.6-.6.6H4.6c-.3 0-.6-.3-.6-.6V2.4c0-.3.3-.6.6-.6z" />
    <path d="M5.9 9.2l1.5 1.5 2.8-2.9" />
  </Svg>
);

export const TrashIcon = () => (
  <Svg>
    <path d="M2.8 4.2h10.4M6.4 4.2V3c0-.5.4-.8.8-.8h1.6c.4 0 .8.3.8.8v1.2m2.3 0l-.55 8.2c-.04.7-.6 1.2-1.3 1.2H5.95c-.7 0-1.26-.5-1.3-1.2L4.1 4.2" />
    <path d="M6.6 7v3.8M9.4 7v3.8" />
  </Svg>
);

export const XIcon = () => (
  <Svg><path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" /></Svg>
);

export const SunIcon = () => (
  <Svg>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1" />
  </Svg>
);

export const MoonIcon = () => (
  <Svg><path d="M13.4 9.4A5.8 5.8 0 016.6 2.6a5.8 5.8 0 106.8 6.8z" /></Svg>
);

export const DownloadIcon = () => (
  <Svg><path d="M8 2.5v7m0 0L5 6.7M8 9.5l3-2.8M2.8 11.5v1.2c0 .4.4.8.8.8h8.8c.4 0 .8-.4.8-.8v-1.2" /></Svg>
);

export const DocumentIcon = () => (
  <Svg viewBox="0 0 24 24">
    <path d="M6 2.8h8l4 4v13.5c0 .5-.4.9-.9.9H6.9c-.5 0-.9-.4-.9-.9V3.7c0-.5.4-.9.9-.9z" />
    <path d="M14 2.8v4.2h4.2M9 12h6M9 15.2h6M9 8.8h2.2" />
  </Svg>
);

export const LogoIcon = () => (
  <Svg viewBox="0 0 24 24">
    <path d="M6.5 3.5h7.8l3.2 3.2v13.1c0 .4-.3.7-.7.7H7.2c-.4 0-.7-.3-.7-.7V4.2c0-.4.3-.7.7-.7z" />
    <path d="M9.4 12.4h5.2M9.4 15.6h5.2M9.4 9.2h2.6" />
  </Svg>
);

export const GripIcon = () => (
  <Svg>
    <path d="M6 4.5h.01M10 4.5h.01M6 8h.01M10 8h.01M6 11.5h.01M10 11.5h.01" />
  </Svg>
);

export const SidebarIcon = () => (
  <Svg>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M6.5 3v10" />
  </Svg>
);

export const PlusIcon = () => (
  <Svg><path d="M8 3.5v9M3.5 8h9" /></Svg>
);

export const PencilIcon = () => (
  <Svg><path d="M11.3 2.9l1.8 1.8L5.6 12.2l-2.4.6.6-2.4 7.5-7.5z" /></Svg>
);

export const ExternalIcon = () => (
  <Svg><path d="M6.5 3.5H3.5v9h9V9.5M9.5 3h3.5v3.5M12.8 3.2L7.5 8.5" /></Svg>
);

export const CheckIcon = () => (
  <Svg><path d="M3.5 8.5l3 3 6-6" /></Svg>
);

export const UserIcon = () => (
  <Svg><circle cx="8" cy="5.6" r="2.4" /><path d="M3.6 13c0-2.4 2-3.9 4.4-3.9s4.4 1.5 4.4 3.9" /></Svg>
);

export const SlidersIcon = () => (
  <Svg><path d="M2.5 5h11M2.5 11h11" /><circle cx="6" cy="5" r="1.6" /><circle cx="10.5" cy="11" r="1.6" /></Svg>
);

export const RefreshIcon = () => (
  <Svg>
    <path d="M13.6 8a5.6 5.6 0 1 1-1.64-3.96" />
    <path d="M13.6 3.2v3.4h-3.4" />
  </Svg>
);

export const MoreIcon = () => (
  <Svg><path d="M4 8h.01M8 8h.01M12 8h.01" /></Svg>
);

/* Google's sign-in mark. Filled, not stroked, so it sits outside .icon. */
export const GoogleMark = () => (
  <svg className="gmark" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 009 18z" />
    <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 010-3.44V4.95H.96a9 9 0 000 8.1l3.01-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
  </svg>
);

/* ---------- contact icons ----------
 *
 * The icon field is a FontAwesome name that goes into \faIcon unescaped, so a
 * typo used to take the whole compile down with "Undefined control sequence".
 * These are the names the vendored fontawesome is known to carry — verified by
 * `node scripts/smoke.mjs --steps contacts`, which compiles all of them — and
 * each one is paired with the glyph the editor shows, so the field can be a
 * picker instead of a guess. Anything outside the list still works via
 * "Something else", it just cannot be promised.
 */
export interface ContactIcon {
  id: string;
  label: string;
  node: ReactNode;
}

export const CONTACT_ICONS: ContactIcon[] = [
  { id: "envelope", label: "Email", node: <Svg><rect x="2" y="3.5" width="12" height="9" rx="1.4" /><path d="m2.6 4.6 5.4 4 5.4-4" /></Svg> },
  { id: "phone", label: "Phone", node: <Svg><path d="M5.6 2.9 7 5.4 5.8 6.8a7 7 0 0 0 3.4 3.4l1.4-1.2 2.5 1.4v2a1 1 0 0 1-1.1 1C7.7 13 3 8.3 2.5 3.9a1 1 0 0 1 1-1.1z" /></Svg> },
  { id: "globe", label: "Website", node: <Svg><circle cx="8" cy="8" r="5.8" /><path d="M2.3 8h11.4" /><path d="M8 2.2a11 11 0 0 1 0 11.6 11 11 0 0 1 0-11.6" /></Svg> },
  { id: "map-marker-alt", label: "Location", node: <Svg><path d="M8 14s4.4-4.3 4.4-7.4A4.4 4.4 0 0 0 3.6 6.6C3.6 9.7 8 14 8 14z" /><circle cx="8" cy="6.5" r="1.7" /></Svg> },
  { id: "linkedin", label: "LinkedIn", node: <Svg><rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.6" /><path d="M5 6.8v4.4M5 4.9v.1" /><path d="M7.7 11.2V6.8M7.7 8.6c0-1 .7-1.8 1.7-1.8s1.7.8 1.7 1.8v2.6" /></Svg> },
  { id: "github", label: "GitHub", node: <Svg><path d="M6.2 13.4v-2c0-.6.2-1 .5-1.3-2-.2-3.7-.9-3.7-4a3 3 0 0 1 .8-2.1c-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7 7 0 0 1 3.8 0c1.5-1 2.2-.8 2.2-.8.5 1.1.2 1.9.1 2.1a3 3 0 0 1 .8 2.1c0 3.1-1.8 3.8-3.7 4 .3.3.5.7.5 1.4v2" /></Svg> },
  { id: "gitlab", label: "GitLab", node: <Svg><path d="M8 13.2 2.6 9.3l.9-3 1.2-3.6 1.4 4.3h3.8l1.4-4.3 1.2 3.6.9 3z" /></Svg> },
  { id: "orcid", label: "ORCID", node: <Svg><circle cx="8" cy="8" r="5.8" /><path d="M6 6.6v4.2M6 4.8v.1" /><path d="M8.6 10.8V6.6h1a2.1 2.1 0 0 1 0 4.2z" /></Svg> },
  { id: "link", label: "Other link", node: <Svg><path d="M6.8 9.2a2.6 2.6 0 0 0 3.8.3l1.8-1.8a2.6 2.6 0 0 0-3.7-3.7l-1 1" /><path d="M9.2 6.8a2.6 2.6 0 0 0-3.8-.3L3.6 8.3a2.6 2.6 0 0 0 3.7 3.7l1-1" /></Svg> },
];

export const CONTACT_ICON_IDS = new Set(CONTACT_ICONS.map((i) => i.id));

export function contactIcon(id: string): ReactNode {
  return CONTACT_ICONS.find((i) => i.id === id)?.node ?? <Svg><circle cx="8" cy="8" r="5.6" /><path d="M8 5.2v3.4M8 10.6v.4" /></Svg>;
}

export const PinIcon = () => (
  <Svg><path d="M8 2.2l1.7 3.7 4 .6-2.9 2.8.7 4-3.5-1.9-3.5 1.9.7-4L2.3 6.5l4-.6z" /></Svg>
);

export const BranchIcon = () => (
  <Svg><circle cx="4.5" cy="3.5" r="1.6" /><circle cx="4.5" cy="12.5" r="1.6" /><circle cx="11.5" cy="7" r="1.6" /><path d="M4.5 5.1v5.8M6.1 7h3.8" /></Svg>
);

export const ShieldIcon = () => (
  <Svg><path d="M8 1.8L13.4 4v4c0 3-2.3 5.2-5.4 6.2C4.9 13.2 2.6 11 2.6 8V4z" /><path d="M5.8 8.2l1.5 1.5 3-3.4" /></Svg>
);

export const LayersIcon = () => (
  <Svg><path d="M8 2L14 5l-6 3-6-3z" /><path d="M2 8l6 3 6-3" /><path d="M2 11l6 3 6-3" /></Svg>
);

export const UpIcon = () => (
  <Svg><path d="M8 12.5V4" /><path d="M4.6 7.4L8 4l3.4 3.4" /></Svg>
);
