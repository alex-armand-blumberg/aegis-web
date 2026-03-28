"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContactModal } from "./ContactModalContext";

type AppRouteNavProps = {
  className?: string;
};

export function AppRouteNav({ className = "" }: AppRouteNavProps) {
  const pathname = usePathname();
  const { openContact } = useContactModal();

  const linkCls = (href: string) => {
    const active = href === "/" ? pathname === "/" : pathname === href;
    return `app-route-nav-link${active ? " is-active" : ""}`;
  };

  return (
    <nav className={`app-route-nav ${className}`.trim()} aria-label="Site sections">
      <Link href="/" className="app-route-nav-brand">
        AEG<span>I</span>S
      </Link>
      <div className="app-route-nav-links">
        <Link href="/" className={linkCls("/")}>
          Home
        </Link>
        <Link href="/escalation" className={linkCls("/escalation")}>
          Index
        </Link>
        <Link href="/map" className={linkCls("/map")}>
          Map
        </Link>
        <Link href="/limitations" className={linkCls("/limitations")}>
          Limitations
        </Link>
        <button type="button" className="app-route-nav-link app-route-nav-btn" onClick={openContact}>
          Contact
        </button>
      </div>
    </nav>
  );
}
