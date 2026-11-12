/**
 * The cancel signal for a request made by a query that TV pages also run.
 * Pass `Platform.isTV`.
 *
 * React Query cancels a request when the last page showing it goes away
 * (Back, or a switch to another season) only if the request took its signal;
 * reading `signal` at all is what opts a query in. Phones take it, so a
 * request nobody is waiting for gives its connection back. TV pages keep
 * their requests running to completion as before, so on TV the signal is
 * never read.
 *
 * A page covered by a newer one stays mounted, so moving forward cancels
 * nothing.
 */
export const phoneSignal = (
  context: { signal: AbortSignal },
  isTV: boolean,
): AbortSignal | undefined => (isTV ? undefined : context.signal);
