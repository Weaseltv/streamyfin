import { Feather } from "@expo/vector-icons";
import type {
  BaseItemDto,
  BaseItemKind,
  CollectionType,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type TouchableOpacityProps, View } from "react-native";
import { Text } from "@/components/common/Text";
import { libraryAccent, NeonBoard } from "@/constants/Colors";
import { glyphGlow, Sizes } from "@/constants/neon";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { TouchableItemRouter } from "../common/TouchableItemRouter";

interface Props extends TouchableOpacityProps {
  library: BaseItemDto;
}

type IconName = React.ComponentProps<typeof Feather>["name"];

const icons: Record<CollectionType, IconName> = {
  movies: "film",
  tvshows: "tv",
  music: "music",
  books: "book",
  homevideos: "video",
  boxsets: "layers",
  playlists: "list",
  folders: "folder",
  livetv: "radio",
  musicvideos: "music",
  photos: "image",
  trailers: "video",
  unknown: "help-circle",
} as const;

/**
 * A library row: 76 high on the stage with a 1pt `line` rule, a 56×40 `inset`
 * glyph box bordered in the library colour, name, count, coloured chevron.
 * Colours follow the Android TV rail: Movies orange, TV yellow, Stand Up
 * magenta, Boxing pink, UFC azure, Live TV green, Music volt; the 4K
 * libraries match their regular counterparts.
 */
export const LibraryItemCard: React.FC<Props> = ({ library, ...props }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { settings } = useSettings();

  const { t } = useTranslation();
  const accent = libraryAccent(library.CollectionType, library.Name);

  const itemType = useMemo(() => {
    let _itemType: BaseItemKind | undefined;

    if (library.CollectionType === "movies") {
      _itemType = "Movie";
    } else if (library.CollectionType === "tvshows") {
      _itemType = "Series";
    } else if (library.CollectionType === "boxsets") {
      _itemType = "BoxSet";
    } else if (library.CollectionType === "homevideos") {
      _itemType = "Video";
    } else if (library.CollectionType === "musicvideos") {
      _itemType = "MusicVideo";
    } else if (library.CollectionType === "music") {
      _itemType = "MusicAlbum";
    } else if (library.CollectionType === "livetv") {
      _itemType = "TvChannel";
    }

    return _itemType;
  }, [library.CollectionType]);

  const itemTypeName = useMemo(() => {
    let nameStr: string;

    if (library.CollectionType === "movies") {
      nameStr = t("library.item_types.movies");
    } else if (library.CollectionType === "tvshows") {
      nameStr = t("library.item_types.series");
    } else if (library.CollectionType === "boxsets") {
      nameStr = t("library.item_types.boxsets");
    } else if (library.CollectionType === "music") {
      nameStr = t("library.item_types.albums");
    } else if (library.CollectionType === "livetv") {
      nameStr = t("library.item_types.channels");
    } else {
      nameStr = t("library.item_types.items");
    }

    return nameStr;
  }, [library.CollectionType]);

  const { data: itemsCount } = useQuery({
    queryKey: ["library-count", library.Id],
    queryFn: async () => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        parentId: library.Id,
        recursive: true,
        limit: 0,
        includeItemTypes: itemType ? [itemType] : undefined,
      });
      return response.data.TotalRecordCount;
    },
  });

  const showStats = settings?.libraryOptions?.showStats !== false;

  return (
    <TouchableItemRouter
      item={library}
      style={{
        minHeight: 76,
        paddingLeft: Sizes.rowLead,
        paddingRight: Sizes.gutter,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        borderBottomWidth: 1,
        borderBottomColor: NeonBoard.line,
      }}
      {...props}
    >
      <View
        style={{
          width: 56,
          height: 40,
          backgroundColor: NeonBoard.inset,
          borderWidth: 1,
          borderColor: accent,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 16,
        }}
      >
        <Feather
          name={icons[library.CollectionType!] || "folder"}
          size={22}
          color={accent}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant='rowTitle' numberOfLines={1}>
          {library.Name}
        </Text>
        {showStats && itemsCount !== undefined ? (
          <Text variant='meta' muted numberOfLines={1} style={{ marginTop: 2 }}>
            {itemsCount} {itemTypeName}
          </Text>
        ) : null}
      </View>
      <View style={glyphGlow(accent)}>
        <Feather name='chevron-right' size={26} color={accent} />
      </View>
    </TouchableItemRouter>
  );
};
