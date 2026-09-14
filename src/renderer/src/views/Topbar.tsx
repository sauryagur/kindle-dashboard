import type { NavItem } from "../types";

interface TopbarProps {
  activeNav: NavItem;
}

export function Topbar({ activeNav }: TopbarProps): React.JSX.Element {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <p className="eyebrow">{activeNav.hint}</p>
        <h1>{activeNav.label}</h1>
      </div>
    </header>
  );
}
