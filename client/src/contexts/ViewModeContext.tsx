import { createContext, useContext, useState, ReactNode } from "react";

type ViewMode = "admin" | "client";

interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  impersonatedCompanyId: number | null;
  setImpersonatedCompanyId: (companyId: number | null) => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    // Lazy initializer runs once on mount (SSR-safe)
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("viewMode");
      if (saved === "client" || saved === "admin") {
        return saved;
      }
    }
    return "admin";
  });

  const [impersonatedCompanyId, setImpersonatedCompanyIdState] = useState<number | null>(() => {
    // Lazy initializer runs once on mount (SSR-safe)
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("impersonatedCompanyId");
      if (saved) {
        const parsed = parseInt(saved, 10);
        return isNaN(parsed) ? null : parsed;
      }
    }
    return null;
  });

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("viewMode", mode);
    }
  };

  const setImpersonatedCompanyId = (companyId: number | null) => {
    setImpersonatedCompanyIdState(companyId);
    if (typeof window !== "undefined") {
      if (companyId === null) {
        localStorage.removeItem("impersonatedCompanyId");
      } else {
        localStorage.setItem("impersonatedCompanyId", companyId.toString());
      }
    }
  };

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode, impersonatedCompanyId, setImpersonatedCompanyId }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (!context) {
    throw new Error("useViewMode must be used within ViewModeProvider");
  }
  return context;
}
