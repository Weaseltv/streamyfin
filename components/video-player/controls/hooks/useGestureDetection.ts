import { useCallback, useEffect, useRef } from "react";
import type { GestureResponderEvent } from "react-native";

export interface SwipeGestureOptions {
  minDistance?: number;
  maxDuration?: number;
  longPressDuration?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onVerticalDragStart?: (side: "left" | "right", initialY: number) => void;
  onVerticalDragMove?: (
    side: "left" | "right",
    deltaY: number,
    currentY: number,
  ) => void;
  onVerticalDragEnd?: (side: "left" | "right") => void;
  onTap?: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
  /**
   * Double tap on the left / right half. When set, a single tap waits out
   * the double-tap window before it fires `onTap` (the iPhone composes the
   * double tap exclusively before the single tap the same way).
   */
  onDoubleTap?: (side: "left" | "right") => void;
  /** Two-finger pinch: `scale` is the finger spread relative to its start. */
  onPinchStart?: () => void;
  onPinchChange?: (scale: number) => void;
  onPinchEnd?: () => void;
  /**
   * Taps in the top and bottom 15 % are ignored by default, like swipes.
   * Pass false to let them through (drags and swipes stay blocked there).
   */
  edgeZonesBlockTaps?: boolean;
  screenWidth?: number;
  screenHeight?: number;
}

/** UIKit's double-tap interval is about 0.3 s. */
const DOUBLE_TAP_WINDOW_MS = 300;

type TouchPoint = { pageX: number; pageY: number };

const spread = (touches: ArrayLike<TouchPoint> | undefined): number => {
  if (!touches || touches.length < 2) return 0;
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
};

export const useGestureDetection = ({
  minDistance = 50,
  maxDuration = 800,
  longPressDuration = 500,
  onSwipeLeft,
  onSwipeRight,
  onVerticalDragStart,
  onVerticalDragMove,
  onVerticalDragEnd,
  onTap,
  onLongPressStart,
  onLongPressEnd,
  onDoubleTap,
  onPinchStart,
  onPinchChange,
  onPinchEnd,
  edgeZonesBlockTaps = true,
  screenWidth = 400,
  screenHeight = 800,
}: SwipeGestureOptions = {}) => {
  const touchStartTime = useRef(0);
  const touchStartPosition = useRef({ x: 0, y: 0 });
  const lastTouchPosition = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragSide = useRef<"left" | "right" | null>(null);
  const hasMovedEnough = useRef(false);
  const gestureType = useRef<"none" | "horizontal" | "vertical">("none");
  const shouldIgnoreTouch = useRef(false);
  const longPressTimeout = useRef<number | null>(null);
  const isLongPressing = useRef(false);
  // Touch began in a top/bottom edge zone: only a tap may come of it.
  const tapOnly = useRef(false);
  // Pinch: active from the second finger until every finger has lifted.
  const isPinching = useRef(false);
  const pinchStartSpread = useRef(0);
  // Deferred single tap while the double-tap window is open.
  const pendingTapTimeout = useRef<number | null>(null);
  const lastTapTime = useRef(0);

  const cancelLongPressTimer = useCallback(() => {
    if (longPressTimeout.current !== null) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }
  }, []);

  const cancelPendingTap = useCallback(() => {
    if (pendingTapTimeout.current !== null) {
      clearTimeout(pendingTapTimeout.current);
      pendingTapTimeout.current = null;
    }
  }, []);

  // Clear any pending timer on unmount
  useEffect(() => cancelLongPressTimer, [cancelLongPressTimer]);
  useEffect(() => cancelPendingTap, [cancelPendingTap]);

  // A tap: immediate without double tap, otherwise the second tap inside
  // the window seeks and a lone tap fires once the window closes.
  const registerTap = useCallback(
    (pageX: number) => {
      if (!onDoubleTap) {
        onTap?.();
        return;
      }
      const now = Date.now();
      if (
        pendingTapTimeout.current !== null &&
        now - lastTapTime.current <= DOUBLE_TAP_WINDOW_MS
      ) {
        cancelPendingTap();
        lastTapTime.current = 0;
        onDoubleTap(pageX < screenWidth / 2 ? "left" : "right");
        return;
      }
      lastTapTime.current = now;
      cancelPendingTap();
      pendingTapTimeout.current = setTimeout(() => {
        pendingTapTimeout.current = null;
        onTap?.();
      }, DOUBLE_TAP_WINDOW_MS) as unknown as number;
    },
    [onDoubleTap, onTap, cancelPendingTap, screenWidth],
  );

  const beginPinch = useCallback(
    (touches: ArrayLike<TouchPoint>) => {
      isPinching.current = true;
      pinchStartSpread.current = spread(touches);
      cancelLongPressTimer();
      cancelPendingTap();
      // The second finger usually lands after the first already moved:
      // abandon whatever that movement started.
      if (isDragging.current && dragSide.current) {
        onVerticalDragEnd?.(dragSide.current);
      }
      if (isLongPressing.current) {
        isLongPressing.current = false;
        onLongPressEnd?.();
      }
      isDragging.current = false;
      dragSide.current = null;
      hasMovedEnough.current = true;
      gestureType.current = "none";
      onPinchStart?.();
    },
    [
      cancelLongPressTimer,
      cancelPendingTap,
      onVerticalDragEnd,
      onLongPressEnd,
      onPinchStart,
    ],
  );

  const handleTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      const touches = event.nativeEvent.touches as
        | ArrayLike<TouchPoint>
        | undefined;
      if (onPinchChange && touches && touches.length >= 2) {
        if (!isPinching.current) beginPinch(touches);
        return;
      }
      if (isPinching.current) return;

      // A held long press owns the gesture, so ignore extra touches
      if (isLongPressing.current) {
        return;
      }

      const startY = event.nativeEvent.pageY;

      // Define exclusion zones (15% from top and bottom)
      const topExclusionZone = screenHeight * 0.15;
      const bottomExclusionZone = screenHeight * 0.85;

      // Check if touch started in exclusion zones
      const inEdgeZone =
        startY < topExclusionZone || startY > bottomExclusionZone;
      if (inEdgeZone && edgeZonesBlockTaps) {
        shouldIgnoreTouch.current = true;
        return;
      }

      shouldIgnoreTouch.current = false;
      tapOnly.current = inEdgeZone;
      touchStartTime.current = Date.now();
      touchStartPosition.current = {
        x: event.nativeEvent.pageX,
        y: startY,
      };
      lastTouchPosition.current = {
        x: event.nativeEvent.pageX,
        y: startY,
      };
      isDragging.current = false;
      dragSide.current = null;
      hasMovedEnough.current = false;
      gestureType.current = "none";

      cancelLongPressTimer();
      isLongPressing.current = false;
      if (onLongPressStart && !inEdgeZone) {
        longPressTimeout.current = setTimeout(() => {
          longPressTimeout.current = null;
          isLongPressing.current = true;
          onLongPressStart();
        }, longPressDuration) as unknown as number;
      }
    },
    [
      screenHeight,
      cancelLongPressTimer,
      longPressDuration,
      onLongPressStart,
      onPinchChange,
      beginPinch,
      edgeZonesBlockTaps,
    ],
  );

  const handleTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      const touches = event.nativeEvent.touches as
        | ArrayLike<TouchPoint>
        | undefined;
      if (onPinchChange && touches && touches.length >= 2) {
        if (!isPinching.current) {
          beginPinch(touches);
          return;
        }
        if (pinchStartSpread.current > 0) {
          onPinchChange(spread(touches) / pinchStartSpread.current);
        }
        return;
      }
      if (isPinching.current) return;

      // Ignore touch if it started in exclusion zone
      if (shouldIgnoreTouch.current) {
        return;
      }

      // Ignore movement while a long press is held
      if (isLongPressing.current) {
        return;
      }

      const currentPosition = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      };

      const deltaX = currentPosition.x - touchStartPosition.current.x;
      const deltaY = currentPosition.y - touchStartPosition.current.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Lower threshold for starting gestures - make it more sensitive
      if (!hasMovedEnough.current && totalDistance > 8) {
        hasMovedEnough.current = true;
        // Movement means this is a swipe or drag, not a long press
        cancelLongPressTimer();
        // Edge zones never start drags or swipes.
        if (tapOnly.current) {
          lastTouchPosition.current = currentPosition;
          return;
        }

        // Determine gesture type based on initial movement direction
        if (absY > absX && absY > 5) {
          // Vertical gesture - start drag immediately
          gestureType.current = "vertical";
          const side =
            touchStartPosition.current.x < screenWidth / 2 ? "left" : "right";
          isDragging.current = true;
          dragSide.current = side;
          onVerticalDragStart?.(side, touchStartPosition.current.y);
        } else if (absX > absY && absX > 10) {
          // Horizontal gesture - mark for discrete swipe
          gestureType.current = "horizontal";
        }
      }

      // Continue vertical drag if already dragging
      if (
        isDragging.current &&
        dragSide.current &&
        gestureType.current === "vertical"
      ) {
        const deltaFromStart = currentPosition.y - touchStartPosition.current.y;
        onVerticalDragMove?.(
          dragSide.current,
          deltaFromStart,
          currentPosition.y,
        );
      }

      lastTouchPosition.current = currentPosition;
    },
    [
      onVerticalDragStart,
      onVerticalDragMove,
      screenWidth,
      cancelLongPressTimer,
      onPinchChange,
      beginPinch,
    ],
  );

  const handleTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      if (isPinching.current) {
        const remaining = event.nativeEvent.touches?.length ?? 0;
        if (remaining === 0) {
          isPinching.current = false;
          hasMovedEnough.current = false;
          gestureType.current = "none";
          onPinchEnd?.();
        }
        return;
      }

      // Ignore touch if it started in exclusion zone
      if (shouldIgnoreTouch.current) {
        shouldIgnoreTouch.current = false;
        return;
      }

      cancelLongPressTimer();

      // Release the long press without treating it as a tap or swipe
      if (isLongPressing.current) {
        isLongPressing.current = false;
        hasMovedEnough.current = false;
        gestureType.current = "none";
        onLongPressEnd?.();
        return;
      }

      const touchEndTime = Date.now();
      const touchEndPosition = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      };

      const touchDuration = touchEndTime - touchStartTime.current;
      const deltaX = touchEndPosition.x - touchStartPosition.current.x;
      const deltaY = touchEndPosition.y - touchStartPosition.current.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // End vertical drag if we were dragging
      if (
        isDragging.current &&
        dragSide.current &&
        gestureType.current === "vertical"
      ) {
        onVerticalDragEnd?.(dragSide.current);
        isDragging.current = false;
        dragSide.current = null;
        hasMovedEnough.current = false;
        gestureType.current = "none";
        return;
      }

      // Check if gesture is too long for discrete actions
      if (touchDuration > maxDuration) {
        hasMovedEnough.current = false;
        gestureType.current = "none";
        return;
      }

      // Handle discrete horizontal swipes (for skip) only if it was marked as horizontal
      if (
        gestureType.current === "horizontal" &&
        hasMovedEnough.current &&
        absX > absY &&
        totalDistance > minDistance
      ) {
        if (deltaX > 0) {
          onSwipeRight?.();
        } else {
          onSwipeLeft?.();
        }
      } else if (
        !hasMovedEnough.current &&
        touchDuration < 300 &&
        totalDistance < 10
      ) {
        // It's a tap - short duration and small movement
        registerTap(touchEndPosition.x);
      }

      hasMovedEnough.current = false;
      gestureType.current = "none";
    },
    [
      maxDuration,
      minDistance,
      onSwipeLeft,
      onSwipeRight,
      onVerticalDragEnd,
      onLongPressEnd,
      cancelLongPressTimer,
      onPinchEnd,
      registerTap,
    ],
  );

  // A cancelled touch never delivers touchEnd, so release whatever is
  // engaged without treating it as a tap or swipe
  const handleTouchCancel = useCallback(() => {
    cancelLongPressTimer();
    if (isPinching.current) {
      isPinching.current = false;
      onPinchEnd?.();
    }
    if (isLongPressing.current) {
      isLongPressing.current = false;
      onLongPressEnd?.();
    }
    if (isDragging.current && dragSide.current) {
      onVerticalDragEnd?.(dragSide.current);
    }
    isDragging.current = false;
    dragSide.current = null;
    hasMovedEnough.current = false;
    gestureType.current = "none";
    shouldIgnoreTouch.current = false;
    tapOnly.current = false;
  }, [cancelLongPressTimer, onLongPressEnd, onVerticalDragEnd, onPinchEnd]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  };
};
