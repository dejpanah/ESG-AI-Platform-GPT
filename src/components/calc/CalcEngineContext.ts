import type { CalcEngineSlug, CalcEngineView } from "@/api/calc-engines";
import { createContext, useContext } from "react";

export const CalcEngineSlugContext = createContext<CalcEngineSlug | null>(null);

export interface CalcEngineRefreshContextValue {
  onReload: () => void;
  onUpdateView?: (updated: CalcEngineView) => void;
}

export const CalcEngineRefreshContext =
  createContext<CalcEngineRefreshContextValue>({
    onReload: () => {},
  });

export function useCalcEngineSlug(): CalcEngineSlug | null {
  return useContext(CalcEngineSlugContext);
}

export function useCalcEngineRefresh(): CalcEngineRefreshContextValue {
  return useContext(CalcEngineRefreshContext);
}
