import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { type TappedCardPage, tappedCardFor } from "@/utils/tappedCard";

/**
 * The card whose tap opened this page, for the page to draw from until its
 * own details arrive. Undefined when the page was reached any other way, when
 * the page has since moved on to another id, and whenever `enabled` is false
 * (TV, offline pages).
 *
 * Taken once, as the page mounts, and kept for as long as the page lives.
 * It is for display: see `utils/tappedCard.ts`.
 */
export function useTappedCard(
  page: TappedCardPage,
  id: string | undefined,
  enabled: boolean,
): BaseItemDto | undefined {
  const { card } = useLocalSearchParams<{ card?: string }>();
  const [taken] = useState(() =>
    enabled ? tappedCardFor(page, id, card) : undefined,
  );
  return enabled && taken && taken.Id === id && card === id ? taken : undefined;
}
