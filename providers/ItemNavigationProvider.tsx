import { createContext, type PropsWithChildren, useContext } from "react";

const ItemNavigationContext = createContext("(home)");
export function ItemNavigationProvider({
  origin,
  children,
}: PropsWithChildren<{ origin: string }>) {
  return (
    <ItemNavigationContext.Provider value={origin}>
      {children}
    </ItemNavigationContext.Provider>
  );
}
export const useItemNavigationOrigin = () => useContext(ItemNavigationContext);
