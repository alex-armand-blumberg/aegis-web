"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { COUNTRY_NAMES } from "@/lib/countries";
import { useCommandPalette } from "./CommandPaletteContext";
import { useMapHandlers } from "./MapCommandsContext";

type CommandItem = {
  id: string;
  label: string;
  meta?: string;
  onSelect: () => void;
};

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const pathname = usePathname();
  const mapHandlers = useMapHandlers();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  /* Reset query when palette opens (closed → open). */
  const wasOpenRef = useRef(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- intentional reset on overlay open */
    if (open && !wasOpenRef.current) {
      setQ("");
      setActive(0);
    }
    wasOpenRef.current = open;
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  const items = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const list: CommandItem[] = [];

    const nav = (path: string, label: string, meta: string) => {
      list.push({
        id: `nav-${path}`,
        label,
        meta,
        onSelect: () => {
          router.push(path);
          setOpen(false);
        },
      });
    };

    nav("/", "Home", "Marketing");
    nav("/map", "Interactive map", "Product");
    nav("/escalation", "Escalation index", "Demo");
    nav("/limitations", "Limitations & methodology notes", "Trust");

    list.push({
      id: "hash-methodology",
      label: "Scroll to methodology (home)",
      meta: "Home anchor",
      onSelect: () => {
        if (pathname === "/") {
          document.getElementById("methodology")?.scrollIntoView({ behavior: "smooth" });
        } else {
          router.push("/#methodology");
        }
        setOpen(false);
      },
    });

    if (pathname === "/map") {
      const ranges = ["1h", "6h", "24h", "7d", "30d"];
      for (const r of ranges) {
        if (!ql || r.includes(ql) || `range ${r}`.includes(ql)) {
          list.push({
            id: `range-${r}`,
            label: `Time range: ${r}`,
            meta: "Map",
            onSelect: () => {
              mapHandlers.setRange?.(r);
              setOpen(false);
            },
          });
        }
      }
      if (mapHandlers.setMode) {
        if (!ql || "2d".includes(ql) || "map".includes(ql)) {
          list.push({
            id: "mode-2d",
            label: "View: 2D map",
            meta: "Map",
            onSelect: () => {
              mapHandlers.setMode?.("2d");
              setOpen(false);
            },
          });
        }
        if (!ql || "3d".includes(ql) || "globe".includes(ql)) {
          list.push({
            id: "mode-3d",
            label: "View: 3D globe",
            meta: "Map",
            onSelect: () => {
              mapHandlers.setMode?.("3d");
              setOpen(false);
            },
          });
        }
      }
      const labels = mapHandlers.layerLabels ?? {};
      for (const [key, name] of Object.entries(labels)) {
        const hay = `${key} ${name}`.toLowerCase();
        if (!ql || hay.includes(ql) || "layer".includes(ql)) {
          list.push({
            id: `layer-${key}`,
            label: `Toggle layer: ${name}`,
            meta: "Map",
            onSelect: () => {
              mapHandlers.toggleLayer?.(key);
              setOpen(false);
            },
          });
        }
      }
      list.push({
        id: "map-refresh",
        label: "Refresh map data",
        meta: "Map",
        onSelect: () => {
          mapHandlers.refresh?.();
          setOpen(false);
        },
      });
      list.push({
        id: "map-recenter",
        label: "Recenter map",
        meta: "Map",
        onSelect: () => {
          mapHandlers.recenter?.();
          setOpen(false);
        },
      });
      list.push({
        id: "map-diag",
        label: "Open system drawer (sources & limits)",
        meta: "Map",
        onSelect: () => {
          mapHandlers.openDiagnostics?.("health");
          setOpen(false);
        },
      });
      for (const c of mapHandlers.hotspotCountries ?? []) {
        if (!ql || c.toLowerCase().includes(ql) || "watchlist".includes(ql) || "hotspot".includes(ql)) {
          list.push({
            id: `map-hot-${c}`,
            label: `Watchlist: focus ${c}`,
            meta: "Map",
            onSelect: () => {
              mapHandlers.flyToCountry?.(c);
              setOpen(false);
            },
          });
        }
      }
    }

    if (ql.length >= 1) {
      for (const c of COUNTRY_NAMES) {
        if (c.toLowerCase().includes(ql)) {
          if (pathname === "/map" && mapHandlers.flyToCountry) {
            list.push({
              id: `map-focus-${c}`,
              label: `Map: focus ${c}`,
              meta: "Map",
              onSelect: () => {
                mapHandlers.flyToCountry?.(c);
                setOpen(false);
              },
            });
          }
          list.push({
            id: `country-${c}`,
            label: `Open escalation for ${c}`,
            meta: "Country",
            onSelect: () => {
              router.push(`/escalation?country=${encodeURIComponent(c)}`);
              setOpen(false);
            },
          });
        }
      }
    }

    const seen = new Set<string>();
    return list.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [q, pathname, router, setOpen, mapHandlers]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items.slice(0, 80);
    const ql = q.trim().toLowerCase();
    return items
      .filter(
        (i) =>
          i.label.toLowerCase().includes(ql) ||
          (i.meta?.toLowerCase().includes(ql) ?? false) ||
          i.id.toLowerCase().includes(ql)
      )
      .slice(0, 80);
  }, [items, q]);

  const run = useCallback(
    (i: number) => {
      const item = filtered[i];
      if (item) item.onSelect();
    },
    [filtered]
  );

  const activeIdx = Math.min(active, Math.max(0, filtered.length - 1));

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, Math.max(0, filtered.length - 1)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const idx = Math.min(active, Math.max(0, filtered.length - 1));
        run(idx);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, active, filtered.length, run, setOpen]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="ui-command-backdrop"
        aria-label="Close command palette"
        onClick={() => setOpen(false)}
      />
      <div className="ui-command-dialog" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className="ui-command-search"
          placeholder="Search commands, countries, layers…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
        />
        <div className="ui-command-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="ui-command-empty">No matching commands.</div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={i === activeIdx}
                className={`ui-command-item ${i === activeIdx ? "ui-command-item-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(i)}
              >
                {item.label}
                {item.meta ? <span className="ui-command-item-meta">{item.meta}</span> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
