/**
 * How far below the bottom of the screen a section may be and still count as
 * near, as a share of the screen's height. A section this close starts its
 * request, so a reading-speed scroll finds it loaded; anything further waits
 * to be scrolled to.
 */
export const NEAR_SCREEN_AHEAD = 0.3;

/**
 * Whether a section is on the screen, above it, or within reach below it.
 *
 * `top` is the section's top edge within the scrolled content and
 * `scrollOffset` how far that content is scrolled. A section the viewer has
 * already scrolled past counts as near: nothing above the screen stays
 * unloaded. Runs on the UI thread while scrolling.
 */
export function isNearScreen(
  top: number,
  scrollOffset: number,
  screenHeight: number,
): boolean {
  "worklet";
  return top - scrollOffset <= screenHeight * (1 + NEAR_SCREEN_AHEAD);
}
