import { Feather } from "@expo/vector-icons";
import { BottomSheetModal, useBottomSheet } from "@gorhom/bottom-sheet";
import type { BottomSheetModalMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { useQuery } from "@tanstack/react-query";
import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { Button } from "@/components/Button";
import JellyseerrStatusIcon from "@/components/jellyseerr/JellyseerrStatusIcon";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import { glowChip, Sizes } from "@/constants/neon";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useAccent } from "@/utils/atoms/pageAccent";
import type {
  QualityProfile,
  RootFolder,
  Tag,
} from "@/utils/jellyseerr/server/api/servarr/base";
import {
  MediaStatus,
  MediaType,
} from "@/utils/jellyseerr/server/constants/media";
import type { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import { writeDebugLog } from "@/utils/log";
import { NeonSheet, neonSheetModalProps } from "../common/NeonSheet";
import { Text } from "../common/Text";
import { PlatformDropdown } from "../PlatformDropdown";

/** A season as the request sheet shows it: number, episode count and Seerr status. */
export interface RequestSeason {
  seasonNumber: number;
  episodeCount: number;
  status: MediaStatus;
}

interface Props {
  id: number;
  title: string;
  requestBody?: MediaRequestBody;
  type: MediaType;
  /** Series only: the season rows; those already available are not selectable. */
  seasons?: RequestSeason[];
  isAnime?: boolean;
  is4k?: boolean;
  onRequested?: () => void;
  onDismiss?: () => void;
}

const CHECK = 20;

/**
 * A 52 season row: square 20 checkbox (checked = filled volt with a glow,
 * unchecked = 1pt `line2`), "Season n" + "n episodes", and the status badge
 * on the right when the season is already requested or available.
 */
export const SeasonRow: React.FC<{
  season: RequestSeason;
  checked?: boolean;
  onToggle?: () => void;
  /** Right side when the row is not selectable (a status badge, a request badge). */
  right?: React.ReactNode;
  /** Something other than the checkbox on the left (the seasons list's chevron). */
  leading?: React.ReactNode;
  accent?: string;
}> = ({
  season,
  checked = false,
  onToggle,
  right,
  leading,
  accent: accentProp,
}) => {
  const accent = useAccent(accentProp);
  const { t } = useTranslation();
  const selectable = !!onToggle;
  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={!selectable}
      activeOpacity={0.7}
      accessibilityRole={selectable ? "checkbox" : undefined}
      accessibilityState={{ checked, disabled: !selectable }}
      style={{
        minHeight: 52,
        paddingLeft: Sizes.rowLead,
        paddingRight: Sizes.gutter,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        borderBottomWidth: 1,
        borderBottomColor: NeonBoard.line,
      }}
    >
      {leading !== undefined ? (
        leading
      ) : onToggle || right === undefined ? (
        <View
          style={[
            {
              width: CHECK,
              height: CHECK,
              marginRight: 14,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: checked ? accent : NeonBoard.line2,
              backgroundColor: checked ? accent : "transparent",
              opacity: selectable ? 1 : 0.5,
            },
            checked ? glowChip(accent) : null,
          ]}
        >
          {checked ? (
            <Feather name='check' size={14} color={NeonBoard.onAccent} />
          ) : null}
        </View>
      ) : null}
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text variant='rowTitle' numberOfLines={1}>
          {t("jellyseerr.season_number", {
            season_number: season.seasonNumber,
          })}
        </Text>
        <Text variant='meta' muted numberOfLines={1} style={{ marginTop: 2 }}>
          {t("jellyseerr.number_episodes", {
            episode_number: season.episodeCount,
          })}
        </Text>
      </View>
      {right}
    </TouchableOpacity>
  );
};

/** A 52 picker row: label in `text`, the value in volt with a caret. */
const PickerRow: React.FC<{ label: string; value?: string | null }> = ({
  label,
  value,
}) => (
  <View
    style={{
      minHeight: 52,
      paddingLeft: Sizes.rowLead,
      paddingRight: Sizes.gutter,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: NeonBoard.card2,
      borderBottomWidth: 1,
      borderBottomColor: NeonBoard.line,
    }}
  >
    <Text variant='rowTitle' numberOfLines={1} style={{ flex: 1 }}>
      {label}
    </Text>
    <Text
      variant='rowTitle'
      accent={sectionAccent("requests")}
      numberOfLines={1}
      style={{ maxWidth: "55%", fontSize: 14 }}
    >
      {value ?? "—"}
    </Text>
    <Feather
      name='chevron-down'
      size={16}
      color={sectionAccent("requests")}
      style={{ marginLeft: 6 }}
    />
  </View>
);

const CloseHead: React.FC<{
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  primary?: React.ReactNode;
}> = ({ eyebrow, title, children, primary }) => {
  const { close } = useBottomSheet();
  return (
    <NeonSheet
      eyebrow={eyebrow}
      title={title}
      onClose={() => close()}
      primary={primary}
    >
      {children}
    </NeonSheet>
  );
};

const RequestModal = forwardRef<
  BottomSheetModalMethods,
  Props & Omit<ViewProps, "id">
>(
  (
    {
      id,
      title,
      requestBody,
      type,
      seasons,
      isAnime = false,
      onRequested,
      onDismiss,
    },
    ref,
  ) => {
    const { jellyseerrApi, jellyseerrUser, requestMedia } = useJellyseerr();
    const [requestOverrides, setRequestOverrides] = useState<MediaRequestBody>({
      mediaId: Number(id),
      mediaType: type,
      userId: jellyseerrUser?.id,
    });
    const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);

    const [qualityProfileOpen, setQualityProfileOpen] = useState(false);
    const [rootFolderOpen, setRootFolderOpen] = useState(false);
    const [tagsOpen, setTagsOpen] = useState(false);
    const [usersOpen, setUsersOpen] = useState(false);

    const { t } = useTranslation();

    const isTv = type === MediaType.TV;

    // The caller decides which seasons the request starts with (all unknown
    // ones, or a single one); the rows let the user narrow that down.
    useEffect(() => {
      setSelectedSeasons(
        Array.isArray(requestBody?.seasons) ? requestBody.seasons : [],
      );
    }, [requestBody?.seasons]);

    // Reset all dropdown states when modal closes
    const handleDismiss = useCallback(() => {
      setQualityProfileOpen(false);
      setRootFolderOpen(false);
      setTagsOpen(false);
      setUsersOpen(false);
      onDismiss?.();
    }, [onDismiss]);

    const { data: serviceSettings } = useQuery({
      queryKey: ["jellyseerr", "request", type, "service"],
      queryFn: async () =>
        jellyseerrApi?.service(type === "movie" ? "radarr" : "sonarr"),
      enabled: !!jellyseerrApi && !!jellyseerrUser,
      refetchOnMount: "always",
    });

    const { data: users } = useQuery({
      queryKey: ["jellyseerr", "users"],
      queryFn: async () =>
        jellyseerrApi?.user({ take: 1000, sort: "displayname" }),
      enabled: !!jellyseerrApi && !!jellyseerrUser,
      refetchOnMount: "always",
    });

    const defaultService = useMemo(
      () => serviceSettings?.find?.((v) => v.isDefault),
      [serviceSettings],
    );

    const { data: defaultServiceDetails } = useQuery({
      queryKey: [
        "jellyseerr",
        "request",
        type,
        "service",
        "details",
        defaultService?.id,
      ],
      queryFn: async () => {
        setRequestOverrides((prev) => ({
          ...prev,
          serverId: defaultService?.id,
        }));
        return jellyseerrApi?.serviceDetails(
          type === "movie" ? "radarr" : "sonarr",
          defaultService!.id,
        );
      },
      enabled: !!jellyseerrApi && !!jellyseerrUser && !!defaultService,
      refetchOnMount: "always",
    });

    const defaultProfile: QualityProfile = useMemo(
      () =>
        defaultServiceDetails?.profiles.find(
          (p) =>
            p.id ===
            (isAnime
              ? defaultServiceDetails.server?.activeAnimeProfileId
              : defaultServiceDetails.server?.activeProfileId),
        ),
      [defaultServiceDetails],
    );

    const defaultFolder: RootFolder = useMemo(
      () =>
        defaultServiceDetails?.rootFolders.find(
          (f) =>
            f.path ===
            (isAnime
              ? defaultServiceDetails?.server.activeAnimeDirectory
              : defaultServiceDetails.server?.activeDirectory),
        ),
      [defaultServiceDetails],
    );

    const defaultTags: Tag[] = useMemo(() => {
      const tags =
        defaultServiceDetails?.tags.filter((t) =>
          (isAnime
            ? defaultServiceDetails?.server.activeAnimeTags
            : defaultServiceDetails?.server.activeTags
          )?.includes(t.id),
        ) ?? [];
      return tags;
    }, [defaultServiceDetails]);

    const seasonTitle = useMemo(() => {
      if (!isTv || selectedSeasons.length === 0) {
        return undefined;
      }
      if (selectedSeasons.length > 1) {
        return t("jellyseerr.season_all");
      }
      return t("jellyseerr.season_number", {
        season_number: selectedSeasons[0],
      });
    }, [isTv, selectedSeasons]);

    const pathTitleExtractor = (item: RootFolder) =>
      `${item.path} (${item.freeSpace.bytesToReadable()})`;

    const qualityProfileOptions = useMemo(
      () => [
        {
          options:
            defaultServiceDetails?.profiles.map((profile) => ({
              type: "radio" as const,
              label: profile.name,
              value: profile.id.toString(),
              selected:
                (requestOverrides.profileId || defaultProfile?.id) ===
                profile.id,
              onPress: () =>
                setRequestOverrides((prev) => ({
                  ...prev,
                  profileId: profile.id,
                })),
            })) || [],
        },
      ],
      [
        defaultServiceDetails?.profiles,
        defaultProfile,
        requestOverrides.profileId,
      ],
    );

    const rootFolderOptions = useMemo(
      () => [
        {
          options:
            defaultServiceDetails?.rootFolders.map((folder) => ({
              type: "radio" as const,
              label: pathTitleExtractor(folder),
              value: folder.id.toString(),
              selected:
                (requestOverrides.rootFolder || defaultFolder?.path) ===
                folder.path,
              onPress: () =>
                setRequestOverrides((prev) => ({
                  ...prev,
                  rootFolder: folder.path,
                })),
            })) || [],
        },
      ],
      [
        defaultServiceDetails?.rootFolders,
        defaultFolder,
        requestOverrides.rootFolder,
      ],
    );

    const tagsOptions = useMemo(
      () => [
        {
          options:
            defaultServiceDetails?.tags.map((tag) => ({
              type: "toggle" as const,
              label: tag.label,
              value:
                requestOverrides.tags?.includes(tag.id) ||
                defaultTags.some((dt) => dt.id === tag.id),
              onToggle: () =>
                setRequestOverrides((prev) => {
                  const currentTags = prev.tags || defaultTags.map((t) => t.id);
                  const hasTag = currentTags.includes(tag.id);
                  return {
                    ...prev,
                    tags: hasTag
                      ? currentTags.filter((id) => id !== tag.id)
                      : [...currentTags, tag.id],
                  };
                }),
            })) || [],
        },
      ],
      [defaultServiceDetails?.tags, defaultTags, requestOverrides.tags],
    );

    const usersOptions = useMemo(
      () => [
        {
          options:
            users?.map((user) => ({
              type: "radio" as const,
              label: user.displayName,
              value: user.id.toString(),
              selected:
                (requestOverrides.userId || jellyseerrUser?.id) === user.id,
              onPress: () =>
                setRequestOverrides((prev) => ({
                  ...prev,
                  userId: user.id,
                })),
            })) || [],
        },
      ],
      [users, jellyseerrUser, requestOverrides.userId],
    );

    const request = useCallback(() => {
      const body = {
        is4k: defaultService?.is4k || defaultServiceDetails?.server.is4k,
        profileId: defaultProfile?.id,
        rootFolder: defaultFolder?.path,
        tags: defaultTags.map((t) => t.id),
        ...requestBody,
        ...requestOverrides,
        ...(isTv ? { seasons: selectedSeasons } : null),
      };

      writeDebugLog("Sending Jellyseerr advanced request", body);

      requestMedia(
        seasonTitle ? `${title}, ${seasonTitle}` : title,
        body,
        onRequested,
      );
    }, [
      requestBody,
      requestOverrides,
      defaultProfile,
      defaultFolder,
      defaultTags,
      isTv,
      selectedSeasons,
      seasonTitle,
    ]);

    const toggleSeason = useCallback(
      (seasonNumber: number) =>
        setSelectedSeasons((prev) =>
          prev.includes(seasonNumber)
            ? prev.filter((n) => n !== seasonNumber)
            : [...prev, seasonNumber].sort((a, b) => a - b),
        ),
      [],
    );

    const seasonRows = useMemo(
      () =>
        (seasons ?? [])
          .filter((s) => s.seasonNumber !== 0)
          .sort((a, b) => a.seasonNumber - b.seasonNumber),
      [seasons],
    );

    const selectedProfileName =
      defaultServiceDetails?.profiles.find(
        (p) => p.id === (requestOverrides.profileId || defaultProfile?.id),
      )?.name || defaultProfile?.name;

    const selectedFolder = defaultServiceDetails?.rootFolders.find(
      (f) => f.path === (requestOverrides.rootFolder || defaultFolder?.path),
    );
    const selectedFolderTitle = selectedFolder
      ? pathTitleExtractor(selectedFolder)
      : defaultFolder
        ? pathTitleExtractor(defaultFolder)
        : undefined;

    const selectedTagsTitle = requestOverrides.tags
      ? defaultServiceDetails?.tags
          .filter((t) => requestOverrides.tags!.includes(t.id))
          .map((t) => t.label)
          .join(", ") || defaultTags.map((t) => t.label).join(", ")
      : defaultTags.map((t) => t.label).join(", ");

    const selectedUserName =
      users?.find(
        (u) => u.id === (requestOverrides.userId || jellyseerrUser?.id),
      )?.displayName || jellyseerrUser?.displayName;

    const requestLabel =
      isTv && selectedSeasons.length > 0
        ? t("request.button_seasons", { count: selectedSeasons.length })
        : t("jellyseerr.request_button");

    const eyebrow = `${t("jellyseerr.request_button")} · ${
      isTv ? t("search.series") : t("search.movies")
    }`;

    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        enableDismissOnClose
        onDismiss={handleDismiss}
        {...neonSheetModalProps}
        stackBehavior='push'
      >
        <CloseHead
          eyebrow={eyebrow}
          title={title}
          primary={
            <Button
              accent={sectionAccent("requests")}
              onPress={request}
              disabled={isTv && selectedSeasons.length === 0}
              iconLeft={
                <Feather name='inbox' size={18} color={NeonBoard.onAccent} />
              }
            >
              {requestLabel}
            </Button>
          }
        >
          {isTv && seasonRows.length > 0 && (
            <View>
              {seasonRows.map((season) => {
                const selectable = season.status === MediaStatus.UNKNOWN;
                return (
                  <SeasonRow
                    key={season.seasonNumber}
                    season={season}
                    checked={selectedSeasons.includes(season.seasonNumber)}
                    onToggle={
                      selectable
                        ? () => toggleSeason(season.seasonNumber)
                        : undefined
                    }
                    right={
                      selectable ? undefined : (
                        <JellyseerrStatusIcon
                          mediaStatus={season.status}
                          showRequestIcon={false}
                        />
                      )
                    }
                  />
                );
              })}
            </View>
          )}
          {defaultService && defaultServiceDetails && users && (
            <View>
              <PlatformDropdown
                groups={qualityProfileOptions}
                trigger={
                  <PickerRow
                    label={t("jellyseerr.quality_profile")}
                    value={selectedProfileName}
                  />
                }
                title={t("jellyseerr.quality_profile")}
                open={qualityProfileOpen}
                onOpenChange={setQualityProfileOpen}
              />
              <PlatformDropdown
                groups={rootFolderOptions}
                trigger={
                  <PickerRow
                    label={t("jellyseerr.root_folder")}
                    value={selectedFolderTitle}
                  />
                }
                title={t("jellyseerr.root_folder")}
                open={rootFolderOpen}
                onOpenChange={setRootFolderOpen}
              />
              <PlatformDropdown
                groups={tagsOptions}
                trigger={
                  <PickerRow
                    label={t("jellyseerr.tags")}
                    value={selectedTagsTitle}
                  />
                }
                title={t("jellyseerr.tags")}
                open={tagsOpen}
                onOpenChange={setTagsOpen}
              />
              <PlatformDropdown
                groups={usersOptions}
                trigger={
                  <PickerRow
                    label={t("jellyseerr.request_as")}
                    value={selectedUserName}
                  />
                }
                title={t("jellyseerr.request_as")}
                open={usersOpen}
                onOpenChange={setUsersOpen}
              />
            </View>
          )}
        </CloseHead>
      </BottomSheetModal>
    );
  },
);

export default RequestModal;
