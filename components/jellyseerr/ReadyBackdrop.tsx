import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { NeonBoard } from "@/constants/Colors";
import {
  type BackdropState,
  finishBackdrop,
  nextBackdrop,
} from "@/utils/images/readyBackdrop";

/** Caller keys this by the source list; no previous route can commit artwork. */
export function ReadyBackdrop({ images }: { images: string[] }) {
  const [state, setState] = useState<BackdropState>(() =>
    nextBackdrop({ visible: null, pending: null, failed: [] }, images),
  );
  const opacity = useRef(new Animated.Value(0)).current;
  const current = useRef(state);
  current.current = state;
  const alive = useRef(true);
  const animating = useRef(false);
  const loadedUri = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      opacity.stopAnimation();
    };
  }, [opacity]);
  useEffect(() => {
    if (state.pending) {
      const uri = state.pending;
      // Stalled images are skipped once for this route, retaining current art.
      const timeout = setTimeout(() => {
        if (loadedUri.current !== uri)
          setState((previous) => finishBackdrop(previous, uri, false));
      }, 20_000);
      return () => clearTimeout(timeout);
    }
    const timer = setTimeout(
      () => {
        loadedUri.current = null;
        opacity.setValue(0);
        setState((previous) => nextBackdrop(previous, images));
      },
      state.visible ? 5_000 : 0,
    );
    return () => clearTimeout(timer);
  }, [state.pending, state.visible, images]);
  const loaded = (uri: string) => {
    if (current.current.pending !== uri || animating.current) return;
    loadedUri.current = uri;
    animating.current = true;
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start(({ finished }) => {
      animating.current = false;
      if (finished && alive.current)
        setState((previous) => finishBackdrop(previous, uri, true));
    });
  };
  return (
    <View style={{ flex: 1, backgroundColor: NeonBoard.card }}>
      {!state.visible && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { alignItems: "center", justifyContent: "center" },
          ]}
        >
          <Feather name='image' size={32} color={NeonBoard.low} />
        </View>
      )}
      {[state.visible, state.pending]
        .filter((uri): uri is string => !!uri)
        .map((uri) => (
          <Animated.View
            key={uri}
            pointerEvents='none'
            style={[
              StyleSheet.absoluteFill,
              { opacity: uri === state.pending ? opacity : 1 },
            ]}
          >
            <Image
              source={{ uri }}
              recyclingKey={uri}
              contentFit='cover'
              style={StyleSheet.absoluteFill}
              onLoad={() => {
                if (current.current.pending === uri) loaded(uri);
              }}
              onError={() =>
                setState((previous) => finishBackdrop(previous, uri, false))
              }
            />
          </Animated.View>
        ))}
    </View>
  );
}
