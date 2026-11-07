import { ScrollView, type ScrollViewProps } from "react-native";
import { useHomeRowPosition } from "@/hooks/useHomeRowPosition";

const scrollToStart = (view: ScrollView) =>
  view.scrollTo({ x: 0, y: 0, animated: false });

/** Shared by every finite horizontal Home row, including optional plugin rows. */
export function HomeRowScrollView({
  rowKey,
  itemKeys,
  onLayout,
  onContentSizeChange,
  ...props
}: ScrollViewProps & { rowKey: string; itemKeys: readonly string[] }) {
  const position = useHomeRowPosition(rowKey, itemKeys, scrollToStart);
  return (
    <ScrollView
      {...props}
      horizontal
      ref={position.ref}
      onLayout={(event) => {
        position.onReady();
        onLayout?.(event);
      }}
      onContentSizeChange={(width, height) => {
        position.flush();
        onContentSizeChange?.(width, height);
      }}
    />
  );
}
