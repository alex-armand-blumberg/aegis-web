import type { ReactNode } from "react";

/** Consistent label → title → body → caveat → action stack inside modules. */
export function ModuleCopyLabel({ children }: { children: ReactNode }) {
  return <div className="ui-metric-label mb-1">{children}</div>;
}

export function ModuleCopyTitle({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-lg font-semibold tracking-wide text-white"
      style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif" }}
    >
      {children}
    </div>
  );
}

export function ModuleCopyBody({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-slate-400">{children}</p>;
}

export function ModuleCopyCaveat({ children }: { children: ReactNode }) {
  return <p className="ui-metric-caveat">{children}</p>;
}

export function ModuleCopyAction({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-2">{children}</div>;
}
