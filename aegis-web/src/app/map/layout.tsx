import type { ReactNode } from "react";

/** Map route uses a focused shell: no marketing footer, full-height workspace. */
export default function MapLayout({ children }: { children: ReactNode }) {
  return <div className="map-route-root">{children}</div>;
}
