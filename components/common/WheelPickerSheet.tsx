import { NeonSheet, NeonSheetRow } from "@/components/common/NeonSheet";
import { useAccent } from "@/utils/atoms/pageAccent";

export type WheelOption<Value extends string | number> = {
  value: Value;
  title: string;
};
type Props<Value extends string | number> = {
  title: string;
  options: WheelOption<Value>[];
  selection: Value;
  onCommit: (value: Value) => void;
  onClose: () => void;
  accent?: string;
};

/** Android keeps the immediate-commit tap list; iOS resolves the SwiftUI file. */
export function WheelPickerSheet<Value extends string | number>({
  title,
  options,
  selection,
  onCommit,
  onClose,
  accent: accentProp,
}: Props<Value>) {
  const accent = useAccent(accentProp);
  return (
    <NeonSheet scroll title={title} accent={accent} onClose={onClose}>
      {options.map((option) => (
        <NeonSheetRow
          key={String(option.value)}
          label={option.title}
          accent={accent}
          selected={option.value === selection}
          onPress={() => {
            onCommit(option.value);
            onClose();
          }}
        />
      ))}
    </NeonSheet>
  );
}
