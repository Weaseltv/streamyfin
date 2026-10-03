import type {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { View, type ViewProps } from "react-native";
import { MoreMoviesWithActor } from "@/components/MoreMoviesWithActor";
import { CastAndCrew } from "@/components/series/CastAndCrew";
import { useItemPeopleQuery } from "@/hooks/useItemPeopleQuery";
import { useOfflineMode } from "@/providers/OfflineModeProvider";

interface Props extends ViewProps {
  item: BaseItemDto;
}

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
        void queryClient.cancelQueries({
          queryKey: ["item", item.Id, "people"],
          exact: true,
        });
        void queryClient.cancelQueries({
          queryKey: ["actor", "movies"],
          predicate: (query) => query.queryKey[3] === item.Id,
        });
      };
    }, [isOffline, item.Id, queryClient]),
  );

  const { data, isLoading } = useItemPeopleQuery(
    item.Id,
    enabled && !isOffline,
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
        <MoreMoviesWithActor
          key={person.Id}
          currentItem={item}
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
    <View {...props}>
      <CastAndCrew
        item={itemWithPeople}
        loading={isLoading}
        className={shouldSpaceCastAndCrew ? "mb-2" : undefined}
      />
      {topPeople.map((person, idx) =>
        renderActorSection(person, idx, topPeople.length),
      )}
    </View>
  );
};
