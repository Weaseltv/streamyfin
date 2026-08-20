import {
  Children,
  cloneElement,
  isValidElement,
  type PropsWithChildren,
  type ReactElement,
} from "react";
import { StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Colors, Prism } from "@/constants/Colors";

interface Props extends ViewProps {
  title?: string | null | undefined;
  description?: ReactElement;
}

export const ListGroup: React.FC<PropsWithChildren<Props>> = ({
  title,
  children,
  description,
  ...props
}) => {
  const childrenArray = Children.toArray(children);

  return (
    <View {...props}>
      {title ? <SectionHeader title={title} className='ml-4' /> : null}
      <View
        style={{ borderWidth: 1, borderColor: Colors.border }}
        className='flex flex-col rounded-xl overflow-hidden pl-0 bg-brand-surface'
      >
        {Children.map(childrenArray, (child, index) => {
          if (isValidElement<{ style?: ViewStyle; icon?: unknown }>(child)) {
            // Rows that carry an icon descend the rainbow by position, so a
            // settings list is hued top to bottom without each screen
            // spelling the colours out.
            const tint = child.props.icon
              ? Prism.settingsIconChipOrder[
                  index % Prism.settingsIconChipOrder.length
                ]
              : undefined;
            return cloneElement(child as any, {
              ...(tint ? { iconTint: tint } : {}),
              style: StyleSheet.compose(
                child.props.style,
                index < childrenArray.length - 1
                  ? styles.borderBottom
                  : undefined,
              ),
            });
          }
          return child;
        })}
      </View>
      {description && <View className='pl-4 mt-1'>{description}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  borderBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
  },
});
