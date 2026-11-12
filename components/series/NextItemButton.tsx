import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import useRouter from "@/hooks/useAppRouter";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { Button } from "../Button";

interface Props extends React.ComponentProps<typeof Button> {
  item: BaseItemDto;
  type?: "next" | "previous";
}

export const NextItemButton: React.FC<Props> = ({
  item,
  type = "next",
  ...props
}) => {
  const router = useRouter();

  const isOffline = useOfflineMode();
  // Episode numbers are metadata, not item offsets: 1-2 is one file and
  // its next item is episode 3. Reuse the player's ID-based navigation.
  const { nextItem, previousItem } = usePlaybackManager({
    item,
    isOffline,
  });
  const adjacentItem = type === "next" ? nextItem : previousItem;

  if (item.Type !== "Episode") return null;

  return (
    <Button
      onPress={() => router.setParams({ id: adjacentItem?.Id })}
      className={"h-12 aspect-square"}
      disabled={!adjacentItem}
      {...props}
    >
      {type === "next" ? (
        <Ionicons name='chevron-forward' size={24} color='white' />
      ) : (
        <Ionicons name='chevron-back' size={24} color='white' />
      )}
    </Button>
  );
};
