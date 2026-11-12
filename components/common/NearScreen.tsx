import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWindowDimensions } from "react-native";
import Animated, {
  type AnimatedRef,
  measure,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useSharedValue,
} from "react-native-reanimated";
import { isNearScreen } from "@/utils/nearScreen";

/**
 * Lets a section low on a title page hold its request until the viewer has
 * scrolled near it.
 *
 * The comparison runs on the UI thread, against the scroll offset the page's
 * parallax already keeps there, so scrolling adds no work to the JS thread.
 * JS hears about it once per section, when the section comes near.
 */
type NearScreenScroll = {
  /** How far the page is scrolled, kept on the UI thread. */
  offset: SharedValue<number>;
  /** A view at the top of the scrolled content, to place sections against. */
  anchor: AnimatedRef<Animated.View>;
  /** Counts changes to the content's size: sections may have moved. */
  revision: SharedValue<number>;
  /** False while what is above the sections is still to be drawn. */
  ready: boolean;
};

const NearScreenContext = createContext<NearScreenScroll | null>(null);

export const NearScreenProvider = NearScreenContext.Provider;

/**
 * For the scrolling page. Give `value` to a `NearScreenProvider` around the
 * content, render a `NearScreenAnchor` as the first thing in it, and pass
 * `onContentSizeChange` to the scroll view.
 *
 * `ready` is false while the content above the sections is a placeholder
 * that will grow (a show's episode list still loading): sections wait for
 * it, or they would all look near and start at once.
 */
export function useNearScreenScroll(offset: SharedValue<number>, ready = true) {
  const anchor = useAnimatedRef<Animated.View>();
  const revision = useSharedValue(0);
  const changes = useRef(0);
  // Fires when the content's size changes, not while it scrolls
  const onContentSizeChange = useCallback(() => {
    changes.current += 1;
    revision.value = changes.current;
  }, [revision]);
  const value = useMemo(
    () => ({ offset, anchor, revision, ready }),
    [offset, anchor, revision, ready],
  );
  return { value, anchor, onContentSizeChange };
}

/** One point tall and taking no room: marks the top of the scrolled content. */
export const NearScreenAnchor = ({
  anchor,
}: {
  anchor: AnimatedRef<Animated.View>;
}) => (
  <Animated.View
    ref={anchor}
    collapsable={false}
    pointerEvents='none'
    style={{ height: 1, marginBottom: -1 }}
  />
);

/**
 * For a section. Put `ref` and `onLayout` on an `Animated.View` (with
 * `collapsable={false}`) around the section and hold its request until `near`
 * is true. `near` never goes back to false.
 *
 * `enabled` false keeps the section waiting whatever its position (a page
 * that is not in front yet).
 *
 * A section starts at once when it has no scrolling page above it to ask, and
 * when it cannot be placed, which is what every section did before this.
 */
export function useNearScreen(enabled = true) {
  const scroll = useContext(NearScreenContext);
  const ref = useAnimatedRef<Animated.View>();
  const { height: screenHeight } = useWindowDimensions();
  const [near, setNear] = useState(false);

  // How many times the section has been laid out; 0 is not on screen yet
  const ownLayout = useSharedValue(0);
  const layouts = useRef(0);
  const onLayout = useCallback(() => {
    layouts.current += 1;
    ownLayout.value = layouts.current;
  }, [ownLayout]);

  // The section's top within the scrolled content, and the layout it was
  // measured at. Measured again only after a layout change: while scrolling
  // the check below is a subtraction and a comparison.
  const top = useSharedValue(0);
  const measuredAt = useSharedValue(-1);
  const reported = useSharedValue(false);

  const offset = scroll?.offset;
  const revision = scroll?.revision;
  const anchor = scroll?.anchor;
  const armed = enabled && !near && scroll?.ready === true;

  useAnimatedReaction(
    () =>
      offset && revision
        ? { offset: offset.value, layout: ownLayout.value + revision.value }
        : null,
    (now) => {
      if (now === null || !anchor || reported.value) return;
      if (!armed) {
        // Whatever was measured is out of date by the time this is armed
        measuredAt.value = -1;
        return;
      }
      if (ownLayout.value === 0) return;
      if (measuredAt.value !== now.layout) {
        // Both are read in the same instant, so the page's own scroll
        // position cancels out and leaves the distance between them
        const section = measure(ref);
        const origin = measure(anchor);
        top.value =
          section && origin
            ? section.pageY - origin.pageY
            : Number.NEGATIVE_INFINITY;
        measuredAt.value = now.layout;
      }
      if (isNearScreen(top.value, now.offset, screenHeight)) {
        reported.value = true;
        runOnJS(setNear)(true);
      }
    },
  );

  return { ref, onLayout, near: near || !scroll };
}
