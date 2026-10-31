// Provider-level router hooks can switch native tabs unexpectedly; see the
// repo's learned fact native-bottom-tabs-userouter-conflict.md.
import { router } from "expo-router";
export function openMyRequests(requestId?: number): void {
  router.navigate({
    pathname: "/(auth)/(tabs)/(search)",
    params: { requestTab: "my", requestId: requestId ? String(requestId) : "" },
  });
}
