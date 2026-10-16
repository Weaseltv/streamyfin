import Svg, { Path } from "react-native-svg";

/**
 * WeaselPlex TV's sidebar icons (`app/src/weaselfin/res/drawable/ic_nav_*.xml`
 * in the Wholphin repo): bold outlines on a 24 grid, 2.4 stroke, round caps
 * and joins, no fill. Same paths, so the phone and the TV draw the same icons.
 */
const NAV_ICON_PATHS = {
  home: ["M3,10 L12,2 L21,10 V21 H15 V14 H9 V21 H3 Z"],
  search: ["M16,16 L22,22", "M19,10 A9,9 0,1 1,1,10 A9,9 0,1 1,19,10"],
  favorites: [
    "M12,21 C8,18 2,14 2,8 C2,2 9,1 12,6 C15,1 22,2 22,8 C22,14 16,18 12,21 Z",
  ],
  requests: [
    "M17,17 L22,22",
    "M19,10 A9,9 0,1 1,1,10 A9,9 0,1 1,19,10",
    "M6,10 H14 M10,6 V14",
  ],
  collections: ["M3,20 V5 H9 L12,8 H20 V11", "M3,20 L6,11 H22 L19,20 Z"],
  movies: [
    "M3,10 H21 V21 H3 Z",
    "M3,10 L2,5 L20,1 L21,6 Z",
    "M7,4 L11,8 M14,2.5 L18,6.5",
  ],
  tvshows: ["M3,8 H21 V21 H3 Z", "M7,2 L12,7 L17,2"],
  standup: [
    "M21,7 A5.5,5.5 0,1 1,10,7 A5.5,5.5 0,1 1,21,7",
    "M11,11 L2,20 L5,22 L14,13",
    "M12,3 L19,10",
  ],
  sports: [
    "M6,3 H18 V10 C18,18 6,18 6,10 Z",
    "M6,5 H2 V8 C2,12 4,13 7,13 M18,5 H22 V8 C22,12 20,13 17,13",
    "M12,17 V22 M8,22 H16",
  ],
  settings: [
    "M9,2 H15 L16,5 L19,6 L22,8 V14 L19,16 L17,19 L15,22 H9 L7,19 L4,17 L2,14 V8 L5,6 L8,5 Z",
    "M16,12 A4,4 0,1 1,8,12 A4,4 0,1 1,16,12",
  ],
} as const;

export type NavIconName = keyof typeof NAV_ICON_PATHS;

export const NavIcon: React.FC<{
  name: NavIconName;
  color: string;
  size?: number;
}> = ({ name, color, size = 24 }) => (
  <Svg width={size} height={size} viewBox='0 0 24 24' fill='none'>
    {NAV_ICON_PATHS[name].map((d) => (
      <Path
        key={d}
        d={d}
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    ))}
  </Svg>
);
