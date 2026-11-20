import type { MenuRow } from "@/components/common/MenuPopover";
import type {
  ActionOption,
  OptionGroup,
  RadioOption,
  ToggleOption,
} from "@/components/PlatformDropdown";

/**
 * The rows the iOS SwiftUI Menu in PlatformDropdown shows, in the same order:
 * per group, a titled radio group as one "Title: Selected" row that opens its
 * choices (untitled radios as their own rows), then toggles, then actions.
 * Radios and toggles carry the circle / filled check-circle; actions have no
 * icon.
 */
export const buildMenuRows = (
  groups: OptionGroup[],
  onOptionSelect?: (value?: any) => void,
): MenuRow[] =>
  groups.flatMap((group, groupIndex) => {
    const radios = group.options.filter(
      (opt) => opt.type === "radio",
    ) as RadioOption[];
    const toggles = group.options.filter(
      (opt) => opt.type === "toggle",
    ) as ToggleOption[];
    const actions = group.options.filter(
      (opt) => opt.type === "action",
    ) as ActionOption[];
    const radioRow = (option: RadioOption, index: number): MenuRow => ({
      key: `radio-${groupIndex}-${index}`,
      label: option.label,
      check: option.selected ? "on" : "off",
      disabled: option.disabled,
      onPress: () => {
        option.onPress();
        onOptionSelect?.(option.value);
      },
    });
    const rows: MenuRow[] = [];
    if (radios.length > 0) {
      if (group.title) {
        const selected = radios.find((opt) => opt.selected);
        rows.push({
          key: `submenu-${groupIndex}`,
          label:
            selected && group.showSelection !== false
              ? `${group.title}: ${selected.label}`
              : group.title,
          childrenTitle: group.title,
          icon: group.icon,
          children: radios.map(radioRow),
        });
      } else {
        rows.push(...radios.map(radioRow));
      }
    }
    toggles.forEach((option, index) => {
      rows.push({
        key: `toggle-${groupIndex}-${index}`,
        label: option.label,
        check: option.value ? "on" : "off",
        disabled: option.disabled,
        onPress: () => {
          option.onToggle();
          onOptionSelect?.(option.value);
        },
      });
    });
    actions.forEach((option, index) => {
      rows.push({
        key: `action-${groupIndex}-${index}`,
        label: option.label,
        disabled: option.disabled,
        icon: option.icon,
        onPress: option.onPress,
      });
    });
    return rows;
  });

export type Rect = { x: number; y: number; width: number; height: number };
export type Insets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type MenuPlacement = {
  /** Distance from the root's top (opening down) or bottom (opening up). */
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
  origin: "top" | "bottom";
  alignRight: boolean;
};

/**
 * Where UIMenu puts its card, as measured on the iPhone (r1 20b, 52c, 55c):
 * it covers the trigger, its top edge on the trigger's top edge, or opening
 * upward (bottom edge on the trigger's bottom edge) when it doesn't fit
 * below; its right edge on the trigger's right edge when the trigger is in
 * the right half of the screen, its left edge on the trigger's left
 * otherwise. Long menus stop at `maxHeightRatio` of the window and scroll.
 * Always inside the safe area, `margin` clear of the edges.
 *
 * `previous` keeps the side and alignment chosen on open, so a submenu that
 * changes the card's size doesn't flip it.
 */
export const placeMenu = ({
  root,
  anchor,
  size,
  insets,
  margin,
  maxHeightRatio,
  previous,
}: {
  /** The overlay's frame in window coordinates. */
  root: Rect;
  /** The trigger's frame in window coordinates. */
  anchor: Rect;
  /** The card's natural size. */
  size: { width: number; height: number };
  insets: Insets;
  margin: number;
  maxHeightRatio: number;
  previous?: MenuPlacement | null;
}): MenuPlacement => {
  const minTop = insets.top + margin;
  const maxBottom = root.height - insets.bottom - margin;
  const minLeft = insets.left + margin;
  const maxRight = root.width - insets.right - margin;
  const cap = Math.round(root.height * maxHeightRatio);

  const aTop = anchor.y - root.y;
  const aBottom = aTop + anchor.height;
  const aLeft = anchor.x - root.x;
  const aRight = aLeft + anchor.width;

  const below = maxBottom - Math.max(aTop, minTop);
  const above = Math.min(aBottom, maxBottom) - minTop;
  const natural = Math.min(size.height, cap);
  const origin =
    previous?.origin ??
    (natural <= below
      ? "top"
      : natural <= above
        ? "bottom"
        : below >= above
          ? "top"
          : "bottom");
  const alignRight =
    previous?.alignRight ?? aLeft + anchor.width / 2 > root.width / 2;
  const left = Math.max(
    minLeft,
    Math.min(alignRight ? aRight - size.width : aLeft, maxRight - size.width),
  );
  if (origin === "top") {
    const top = Math.max(aTop, minTop);
    return {
      top,
      left,
      maxHeight: Math.min(cap, maxBottom - top),
      origin,
      alignRight,
    };
  }
  const bottomEdge = Math.min(aBottom, maxBottom);
  return {
    bottom: root.height - bottomEdge,
    left,
    maxHeight: Math.min(cap, bottomEdge - minTop),
    origin,
    alignRight,
  };
};
