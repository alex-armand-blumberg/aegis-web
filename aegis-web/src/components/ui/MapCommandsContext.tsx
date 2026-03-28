"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type MapCommandHandlers = {
  setRange?: (range: string) => void;
  toggleLayer?: (layer: string) => void;
  setMode?: (mode: "2d" | "3d") => void;
  refresh?: () => void;
  recenter?: () => void;
  layerLabels?: Record<string, string>;
  currentRange?: string;
};

const HandlersCtx = createContext<MapCommandHandlers>({});

const SetHandlersCtx = createContext<(h: MapCommandHandlers) => void>(() => {});

export function MapCommandsProvider({ children }: { children: ReactNode }) {
  const [handlers, setHandlers] = useState<MapCommandHandlers>({});
  return (
    <HandlersCtx.Provider value={handlers}>
      <SetHandlersCtx.Provider value={setHandlers}>{children}</SetHandlersCtx.Provider>
    </HandlersCtx.Provider>
  );
}

export function useMapHandlers() {
  return useContext(HandlersCtx);
}

/** Register / update map-specific command handlers; cleared on unmount. */
export function useRegisterMapHandlers(handlers: MapCommandHandlers) {
  const setHandlers = useContext(SetHandlersCtx);
  const layerKey = handlers.layerLabels ? JSON.stringify(handlers.layerLabels) : "";
  useEffect(() => {
    setHandlers(handlers);
    return () => setHandlers({});
    // handlers object identity may change each render; members listed below drive updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- register latest handlers snapshot
  }, [
    setHandlers,
    handlers.setRange,
    handlers.toggleLayer,
    handlers.setMode,
    handlers.refresh,
    handlers.recenter,
    handlers.currentRange,
    layerKey,
  ]);
}
