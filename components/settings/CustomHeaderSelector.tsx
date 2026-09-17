import { Feather } from "@expo/vector-icons";
import { useAtomValue } from "jotai";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Chip } from "@/components/common/Chip";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import {
  type CustomHeader,
  customHeadersVersionAtom,
  getIntegrationHeaderConfig,
  getJellyfinHeaders,
  type HeaderConfig,
  type HeaderSource,
  type IntegrationKey,
  updateIntegrationHeaderConfig,
} from "@/utils/customHeaders";
import { storage } from "@/utils/mmkv";
import { CustomHeaderList } from "./CustomHeaderList";

interface CustomHeaderSelectorProps {
  integrationKey: IntegrationKey;
  title?: string;
  description?: string;
}

/**
 * Header configuration for a self-hosted integration: reuse the Jellyfin
 * headers (same gateway), define its own, or send none.
 */
export function CustomHeaderSelector({
  integrationKey,
  title,
  description,
}: CustomHeaderSelectorProps): React.ReactElement {
  const { t } = useTranslation();
  const serverUrl = storage.getString("serverUrl");

  const [config, setConfig] = useState<HeaderConfig>(() =>
    getIntegrationHeaderConfig(integrationKey),
  );

  const persist = useCallback(
    (next: HeaderConfig) => {
      setConfig(next);
      updateIntegrationHeaderConfig(integrationKey, next);
    },
    [integrationKey],
  );

  const setSource = useCallback(
    (source: HeaderSource) => persist({ ...config, source }),
    [config, persist],
  );

  const setHeaders = useCallback(
    (customHeaders: CustomHeader[]) =>
      setConfig((prev) => ({ ...prev, customHeaders })),
    [],
  );

  const commitHeaders = useCallback(
    (customHeaders: CustomHeader[]) =>
      persist({ ...config, source: "custom", customHeaders }),
    [config, persist],
  );

  // Subscribed to the version so the preview isn't stale after the Jellyfin
  // headers are edited on another screen while this one stays mounted.
  const customHeadersVersion = useAtomValue(customHeadersVersionAtom);
  const jellyfinHeaderNames = useMemo(
    () => Object.keys(getJellyfinHeaders(serverUrl)),
    [serverUrl, customHeadersVersion],
  );

  return (
    <View className='mt-4'>
      {title ? <SectionHeader title={title} /> : null}
      {description ? (
        <Text variant='meta' muted className='px-4 mb-3'>
          {description}
        </Text>
      ) : null}

      <View className='flex-row gap-2 mb-4 px-4'>
        <Chip
          selected={config.source === "jellyfin"}
          onPress={() => setSource("jellyfin")}
          icon={
            <Feather
              name='link'
              size={14}
              color={
                config.source === "jellyfin"
                  ? NeonBoard.onAccent
                  : NeonBoard.mid
              }
            />
          }
          label={t("custom_headers.source_jellyfin")}
          disabled={!serverUrl}
        />
        <Chip
          selected={config.source === "custom"}
          onPress={() => setSource("custom")}
          icon={
            <Feather
              name='code'
              size={14}
              color={
                config.source === "custom" ? NeonBoard.onAccent : NeonBoard.mid
              }
            />
          }
          label={t("custom_headers.source_custom")}
        />
        <Chip
          selected={config.source === "none"}
          onPress={() => setSource("none")}
          icon={
            <Feather
              name='x-circle'
              size={14}
              color={
                config.source === "none" ? NeonBoard.onAccent : NeonBoard.mid
              }
            />
          }
          label={t("custom_headers.source_none")}
        />
      </View>

      {config.source === "jellyfin" ? (
        <View className='px-4 py-2 border-b border-line'>
          <Text variant='meta' muted className='mb-2'>
            {t("custom_headers.using_jellyfin_headers")}
          </Text>
          {jellyfinHeaderNames.length === 0 ? (
            <Text variant='caption' muted>
              {t("custom_headers.no_jellyfin_headers")}
            </Text>
          ) : (
            jellyfinHeaderNames.map((name) => (
              <View key={name} className='flex-row items-center gap-2 mb-1'>
                <Feather name='check' size={14} color={NeonBoard.volt} />
                <Text variant='meta'>{name}</Text>
              </View>
            ))
          )}
        </View>
      ) : null}

      {config.source === "custom" ? (
        <View className='px-4'>
          <CustomHeaderList
            headers={config.customHeaders}
            onChange={setHeaders}
            onCommit={commitHeaders}
          />
        </View>
      ) : null}

      {config.source === "none" ? (
        <View className='px-4 py-2 border-b border-line'>
          <Text variant='meta' muted>
            {t("custom_headers.integration_none")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
