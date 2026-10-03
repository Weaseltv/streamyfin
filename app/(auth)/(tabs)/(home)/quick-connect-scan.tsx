import { Platform } from "react-native";
import { QuickConnectScanScreen } from "@/components/settings/QuickConnectScanScreen";

export default function QuickConnectScanPage() {
  if (Platform.isTV) return null;
  return <QuickConnectScanScreen />;
}
