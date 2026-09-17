import { Feather } from "@expo/vector-icons";
import { forwardRef } from "react";
import {
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { FontFace, MAX_FONT_SCALE, Sizes } from "@/constants/neon";

interface Props extends Omit<TextInputProps, "value" | "onChangeText"> {
  value: string;
  onChangeText: (text: string) => void;
  /** Clears the query; falls back to `onChangeText("")`. */
  onClear?: () => void;
  accent?: string;
}

export const SEARCH_FIELD_HEIGHT = 42;

/**
 * The 42 search strip under the page head: an 18 accent `search` glyph, the
 * query in Barlow 15/600 with an accent caret and selection, and a clear
 * glyph on the right. Sits on the stage with a 1pt `line` rule below.
 */
export const SearchField = forwardRef<TextInput, Props>(
  ({ value, onChangeText, onClear, accent = NeonBoard.volt, ...rest }, ref) => (
    <View
      style={{
        height: SEARCH_FIELD_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: Sizes.gutter,
        gap: 10,
        backgroundColor: NeonBoard.stage,
        borderBottomWidth: 1,
        borderBottomColor: NeonBoard.line,
      }}
    >
      <Feather name='search' size={18} color={accent} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        allowFontScaling
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        placeholderTextColor={NeonBoard.low}
        selectionColor={accent}
        cursorColor={accent}
        autoCorrect={false}
        autoCapitalize='none'
        returnKeyType='search'
        clearButtonMode='never'
        style={{
          flex: 1,
          height: SEARCH_FIELD_HEIGHT,
          paddingVertical: 0,
          color: NeonBoard.text,
          ...FontFace.bodySemi,
          fontSize: 15,
        }}
        {...rest}
      />
      {value.length > 0 ? (
        <TouchableOpacity
          onPress={() => (onClear ? onClear() : onChangeText(""))}
          hitSlop={8}
          accessibilityRole='button'
          style={{
            width: 28,
            height: 28,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name='x' size={18} color={NeonBoard.mid} />
        </TouchableOpacity>
      ) : null}
    </View>
  ),
);

SearchField.displayName = "SearchField";
