"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type DrawerShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  tabs?: { id: string; label: string; content: ReactNode }[];
  children?: ReactNode;
  showHandle?: boolean;
};

/** Mobile-first bottom sheet; sticky header + optional tabs. */
export function DrawerShell({
  open,
  onOpenChange,
  title,
  tabs,
  children,
  showHandle = true,
}: DrawerShellProps) {
  const [tab, setTab] = useState(() => tabs?.[0]?.id ?? "");
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY = useRef(0);
  const startY = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      startY.current = e.clientY;
      dragY.current = 0;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    []
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    dragY.current = Math.max(0, e.clientY - startY.current);
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dragY.current}px)`;
    }
  }, []);

  const onPointerUp = useCallback(() => {
    if (dragY.current > 80) {
      onOpenChange(false);
    }
    if (sheetRef.current) {
      sheetRef.current.style.transform = "";
    }
    dragY.current = 0;
  }, [onOpenChange]);

  useEffect(() => {
    function onEsc(ev: KeyboardEvent) {
      if (ev.key === "Escape" && open) onOpenChange(false);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onOpenChange]);

  if (!open) return null;

  const tabValid = tabs?.some((t) => t.id === tab) ?? false;
  const effectiveTabId = tabValid ? tab : (tabs?.[0]?.id ?? "");
  const activeTab = tabs?.find((t) => t.id === effectiveTabId);

  return (
    <>
      <button
        type="button"
        className="ui-drawer-backdrop ui-drawer-backdrop-open"
        aria-label="Close drawer"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={sheetRef}
        className="ui-drawer-sheet ui-drawer-sheet-open"
        role="dialog"
        aria-modal="true"
      >
        {showHandle ? (
          <div
            className="ui-drawer-handle"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        ) : null}
        <div className="ui-drawer-header-sticky">
          <div className="text-sm font-semibold tracking-wide text-white">{title}</div>
          {tabs && tabs.length > 0 ? (
            <div className="ui-drawer-tabs ui-segmented" style={{ border: "none", background: "transparent", padding: 0 }}>
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`ui-segmented-item ${effectiveTabId === t.id ? "ui-segmented-item-active" : ""}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="ui-drawer-body">{activeTab ? activeTab.content : children}</div>
      </div>
    </>
  );
}
