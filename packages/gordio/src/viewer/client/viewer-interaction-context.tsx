import { createContext, useContext, type ReactNode } from "react";

interface ViewerInteractionContextValue {
  toggleBoxCollapse: (boxId: string) => void;
}

const ViewerInteractionContext = createContext<ViewerInteractionContextValue | null>(null);

export function ViewerInteractionProvider({
  toggleBoxCollapse,
  children,
}: {
  toggleBoxCollapse: (boxId: string) => void;
  children: ReactNode;
}) {
  return (
    <ViewerInteractionContext.Provider value={{ toggleBoxCollapse }}>
      {children}
    </ViewerInteractionContext.Provider>
  );
}

export function useViewerInteraction() {
  const value = useContext(ViewerInteractionContext);

  if (!value) {
    throw new Error("useViewerInteraction must be used within ViewerInteractionProvider");
  }

  return value;
}
