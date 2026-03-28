"use client";

import type { ReactNode } from "react";
import { CommandPaletteProvider } from "./CommandPaletteContext";
import { ContactModalProvider } from "./ContactModalContext";
import { MapCommandsProvider } from "./MapCommandsContext";
import { CommandPalette } from "./CommandPalette";

export function UiProviders({ children }: { children: ReactNode }) {
  return (
    <ContactModalProvider>
      <CommandPaletteProvider>
        <MapCommandsProvider>
          {children}
          <CommandPalette />
        </MapCommandsProvider>
      </CommandPaletteProvider>
    </ContactModalProvider>
  );
}
