import { t } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner-native";
import { BoundedRefresh } from "@/utils/async/boundedRefresh";

export function useManualRefresh(work: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const currentWork = useRef(work);
  currentWork.current = work;
  const task = useRef(new BoundedRefresh()).current;
  useEffect(() => {
    task.activate();
    return () => task.dispose();
  }, [task]);
  const onRefresh = useCallback(
    () =>
      task.run(currentWork.current, setRefreshing, () =>
        toast.error(t("home.section_failed")),
      ),
    [task],
  );
  return { refreshing, onRefresh };
}
