/**
 * The library screen, mounted inside the Home stack.
 *
 * Home's "See all" used to push the Library tab's route, which switched tabs
 * and put the screen on the Library stack: Back then walked that tab's history
 * (often a library opened by an earlier "See all") instead of returning Home.
 * Same component, Home's stack, so Back goes to the page you came from.
 */
export { default } from "../../(libraries)/[libraryId]";
