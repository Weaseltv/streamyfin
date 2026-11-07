import { useCallback, useContext, useLayoutEffect, useRef } from "react";
import { HomeRowResetContext } from "@/providers/HomeRowResetProvider";
import { HomeRowPosition } from "@/utils/homeRowPosition";

export const scrollListToStart = (view: {
  scrollToOffset: (options: { offset: number; animated: boolean }) => void;
}) => view.scrollToOffset({ offset: 0, animated: false });

export function useHomeRowPosition<T>(
  identity: string,
  items: readonly string[],
  scrollToStart: (view: T) => void,
  pages?: number,
) {
  const context = useContext(HomeRowResetContext);
  const ref = useRef<T | null>(null);
  const ready = useRef(false);
  const readyView = useRef<T | null>(null);
  const position = useRef(new HomeRowPosition()).current;
  const current = useRef({ context, identity, items, pages, scrollToStart });
  current.current = { context, identity, items, pages, scrollToStart };
  const flush = useCallback(() => {
    const value = current.current;
    if (!value.context) return;
    position.observe({
      scope: JSON.stringify([value.context.scope, value.identity]),
      revision: value.context.revision,
      items: value.items,
      pages: value.pages,
    });
    const view = ref.current;
    position.flush(value.context.visible && ready.current && view != null, () =>
      value.scrollToStart(view!),
    );
  }, [position]);
  const onReady = useCallback(() => {
    if (!ready.current || readyView.current !== ref.current) {
      position.request();
      readyView.current = ref.current;
    }
    ready.current = true;
    flush();
  }, [position, flush]);
  useLayoutEffect(flush, [context, identity, items, pages, flush]);
  return { ref, onReady, flush, home: context != null };
}
