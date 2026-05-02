"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { EscalationForecastPoint, EscalationPoint } from "@/lib/escalation";

export type SavedEscalationData = {
  series: EscalationPoint[];
  forecast: EscalationForecastPoint[];
  escalationThreshold: number;
  escalationFlaggedMonths: string[];
  preEscalationMonths: string[];
  dataSource?: string;
  methodologyVersion?: string;
  modelVersion?: string;
  sources?: Array<{
    id: string;
    label: string;
    status?: "ok" | "skipped" | "error";
    enabled: boolean;
    configured: boolean;
    attribution: string;
    termsNote: string;
    lastFetchedAt?: string;
  }>;
  dataFreshness?: {
    newestSignalAt?: string;
    oldestSignalAt?: string;
    medianFreshnessHours?: number;
  };
  risk_30d?: number;
  risk_60d?: number;
  risk_90d?: number;
};

export type SavedPlotState = {
  data: SavedEscalationData;
  country: string;
  startDate: string;
  endDate: string;
  threshold: number;
  smooth: number;
  showComponents: boolean;
} | null;

type EscalationPlotContextValue = {
  savedPlot: SavedPlotState;
  savePlot: (state: NonNullable<SavedPlotState>) => void;
  clearPlot: () => void;
};

const EscalationPlotContext = createContext<EscalationPlotContextValue | null>(
  null
);

export function EscalationPlotProvider({ children }: { children: ReactNode }) {
  const [savedPlot, setSavedPlot] = useState<SavedPlotState>(null);

  const savePlot = useCallback((state: NonNullable<SavedPlotState>) => {
    setSavedPlot(state);
  }, []);

  const clearPlot = useCallback(() => {
    setSavedPlot(null);
  }, []);

  return (
    <EscalationPlotContext.Provider
      value={{ savedPlot, savePlot, clearPlot }}
    >
      {children}
    </EscalationPlotContext.Provider>
  );
}

export function useEscalationPlot() {
  const ctx = useContext(EscalationPlotContext);
  if (!ctx) {
    throw new Error("useEscalationPlot must be used within EscalationPlotProvider");
  }
  return ctx;
}
