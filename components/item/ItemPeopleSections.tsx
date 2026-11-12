import type {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import type { ViewProps } from "react-native";
import Animated from "react-native-reanimated";
import { useNearScreen } from "@/components/common/NearScreen";
import { MoreMoviesWithActor } from "@/components/MoreMoviesWithActor";
import { CastAndCrew } from "@/components/series/CastAndCrew";
import { useItemPeopleQuery } from "@/hooks/useItemPeopleQuery";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { cancelItemPeopleWork } from "@/utils/query/cancelItemPeopleWork";

interface Props extends ViewProps {
  item: BaseItemDto;
}

/**
 * One "More with" row. Each row judges for itself whether it is near the
 * screen, so the third actor's request is not made for a viewer who stops at
 * the cast. Until then the row shows its title over the usual placeholder,
 * which keeps the rows below it where they will be.
 */
const ActorSection: React.FC<{
  item: BaseItemDto;
  actorId: string;
  actorName?: string | null;
  className?: string;
}> = ({ item, actorId, actorName, className }) => {
  const { ref, onLayout, near } = useNearScreen();
  return (
    <Animated.View ref={ref} onLayout={onLayout} collapsable={false}>
      <MoreMoviesWithActor
        currentItem={item}
        actorId={actorId}
        actorName={actorName}
        className={className}
        enabled={near}
      />
    </Animated.View>
  );
};

export const ItemPeopleSections: React.FC<Props> = ({ item, ...props }) => {
  const isOffline = useOfflineMode();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);

  // In this RN version InteractionManager is a setImmediate stub. Use
  // actual screen focus, and stop lower-section work when the screen blurs.
  // This is a focus gate, not a guarantee that the native animation has ended.
  useFocusEffect(
    useCallback(() => {
      if (isOffline) return;
      setEnabled(true);
      return () => {
        setEnabled(false);
        // A frozen React tree may not commit that state update yet. Cancel
        // in the focus callback itself so network work stops independently.
        void cancelItemPeopleWork(queryClient, item.Id);
      };
    }, [isOffline, item.Id, queryClient]),
  );

  // Focus opens the gate above; being near the screen is the second
  // condition. The cast is asked for when the viewer has scrolled near it,
  // or at once on a page short enough that it already is. Only a focused
  // page is measured, and a page that has started stays started.
  const { ref, onLayout, near } = useNearScreen(enabled && !isOffline);

  // Pending, not loading: a held request has nothing to show yet either
  const { data, isPending } = useItemPeopleQuery(
    item.Id,
    enabled && near && !isOffline,
  );

  const people = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const itemWithPeople = useMemo(() => {
    return { ...item, People: people } as BaseItemDto;
  }, [item, people]);

  // Jellyfin can list the same person several times (e.g. an actor also
  // credited as writer). Dedupe by Id so the same actor section isn't rendered
  // twice and we still surface 3 distinct people.
  const topPeople = useMemo(() => {
    const seen = new Set<string>();
    const unique: BaseItemPerson[] = [];
    for (const person of people) {
      if (!person.Id || seen.has(person.Id)) continue;
      seen.add(person.Id);
      unique.push(person);
      if (unique.length >= 3) break;
    }
    return unique;
  }, [people]);

  const renderActorSection = useCallback(
    (person: BaseItemPerson, idx: number, total: number) => {
      if (!person.Id) return null;

      const spacingClassName = idx === total - 1 ? undefined : "mb-2";

      return (
        <ActorSection
          key={person.Id}
          item={item}
          actorId={person.Id}
          actorName={person.Name}
          className={spacingClassName}
        />
      );
    },
    [item],
  );

  if (isOffline || !enabled) return null;

  const shouldSpaceCastAndCrew = topPeople.length > 0;

  return (
    <Animated.View {...props} ref={ref} onLayout={onLayout} collapsable={false}>
      <CastAndCrew
        item={itemWithPeople}
        loading={isPending}
        className={shouldSpaceCastAndCrew ? "mb-2" : undefined}
      />
      {topPeople.map((person, idx) =>
        renderActorSection(person, idx, topPeople.length),
      )}
    </Animated.View>
  );
};
