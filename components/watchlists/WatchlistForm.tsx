import { Feather } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Chip } from "@/components/common/Chip";
import { Input } from "@/components/common/Input";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import type {
  StreamystatsWatchlistAllowedItemType,
  StreamystatsWatchlistSortOrder,
} from "@/utils/streamystats/types";

const ITEM_TYPES: Array<{
  value: StreamystatsWatchlistAllowedItemType;
  label: string;
}> = [
  { value: null, label: "All Types" },
  { value: "Movie", label: "Movies Only" },
  { value: "Series", label: "Series Only" },
  { value: "Episode", label: "Episodes Only" },
];

const SORT_OPTIONS: Array<{
  value: StreamystatsWatchlistSortOrder;
  label: string;
}> = [
  { value: "custom", label: "Custom Order" },
  { value: "name", label: "Name" },
  { value: "dateAdded", label: "Date Added" },
  { value: "releaseDate", label: "Release Date" },
];

export interface WatchlistFormValues {
  name: string;
  description: string;
  isPublic: boolean;
  allowedItemType: StreamystatsWatchlistAllowedItemType;
  defaultSortOrder: StreamystatsWatchlistSortOrder;
}

interface Props {
  initialValues?: Partial<WatchlistFormValues>;
  submitLabel: string;
  submitIcon: keyof typeof Feather.glyphMap;
  pending: boolean;
  onSubmit: (values: WatchlistFormValues) => void;
  autoFocusName?: boolean;
}

const FieldLabel: React.FC<{ label: string }> = ({ label }) => (
  <Text
    variant='meta'
    muted
    style={{ marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}
  >
    {label}
  </Text>
);

/**
 * The create / edit watchlist form on the `card` stage (both screens are
 * modals): `Input` fields, a `SettingSwitch` row, chip pickers for the
 * content type and sort order, and the primary at the bottom.
 */
export const WatchlistForm: React.FC<Props> = ({
  initialValues,
  submitLabel,
  submitIcon,
  pending,
  onSubmit,
  autoFocusName = false,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [isPublic, setIsPublic] = useState(initialValues?.isPublic ?? false);
  const [allowedItemType, setAllowedItemType] =
    useState<StreamystatsWatchlistAllowedItemType>(
      initialValues?.allowedItemType ?? null,
    );
  const [defaultSortOrder, setDefaultSortOrder] =
    useState<StreamystatsWatchlistSortOrder>(
      initialValues?.defaultSortOrder ?? "custom",
    );

  const canSubmit = name.trim().length > 0 && !pending;

  const handleSubmit = useCallback(() => {
    if (!name.trim()) return;
    onSubmit({
      name,
      description,
      isPublic,
      allowedItemType,
      defaultSortOrder,
    });
  }, [
    name,
    description,
    isPublic,
    allowedItemType,
    defaultSortOrder,
    onSubmit,
  ]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: NeonBoard.card }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: Sizes.gutter,
          paddingTop: 16,
          paddingBottom: insets.bottom + 20,
          gap: 20,
        }}
        keyboardShouldPersistTaps='handled'
      >
        <View>
          <FieldLabel label={`${t("watchlists.name_label")} *`} />
          <Input
            value={name}
            onChangeText={setName}
            placeholder={t("watchlists.name_placeholder")}
            autoFocus={autoFocusName}
          />
        </View>

        <View>
          <FieldLabel label={t("watchlists.description_label")} />
          <Input
            value={description}
            onChangeText={setDescription}
            placeholder={t("watchlists.description_placeholder")}
            multiline
            numberOfLines={3}
            textAlignVertical='top'
            style={{ minHeight: 80 }}
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: Sizes.row,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: NeonBoard.line,
            paddingVertical: 8,
          }}
        >
          <View style={{ flex: 1, marginRight: 16 }}>
            <Text variant='rowTitle'>{t("watchlists.is_public_label")}</Text>
            <Text variant='meta' muted style={{ marginTop: 2 }}>
              {t("watchlists.is_public_description")}
            </Text>
          </View>
          <SettingSwitch value={isPublic} onValueChange={setIsPublic} />
        </View>

        <View>
          <FieldLabel label={t("watchlists.allowed_type_label")} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ITEM_TYPES.map((type) => (
              <Chip
                key={type.value ?? "all"}
                label={type.label}
                selected={allowedItemType === type.value}
                onPress={() => setAllowedItemType(type.value)}
              />
            ))}
          </View>
        </View>

        <View>
          <FieldLabel label={t("watchlists.sort_order_label")} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SORT_OPTIONS.map((sort) => (
              <Chip
                key={sort.value}
                label={sort.label}
                selected={defaultSortOrder === sort.value}
                onPress={() => setDefaultSortOrder(sort.value)}
              />
            ))}
          </View>
        </View>

        <Button
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={pending}
          iconLeft={
            <Feather name={submitIcon} size={16} color={NeonBoard.onAccent} />
          }
        >
          {submitLabel}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
