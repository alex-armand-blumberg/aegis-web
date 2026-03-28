"use client";

import type { ReactNode } from "react";
import { CommandPaletteProvider } from "./CommandPaletteContext";
import { MapCommandsProvider } from "./MapCommandsContext";
import { CommandPalette } from "./CommandPalette";

export function UiProviders({ children }: { children: ReactNode }) {
  return (
    <CommandPaletteProvider>
      <MapCommandsProvider>
        {children}
        <CommandPalette />
      </MapCommandsProvider>
    </CommandPaletteProvider>
  );
}
