import { useAtom, useSetAtom } from "jotai";
import { useEffect, useId } from "react";
import {
  confirmDeleteHostsAtom,
  confirmDeleteRequestAtom,
} from "@/hooks/useConfirmDelete";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Renders the pending `useConfirmDelete` prompt as the P14 confirm dialog.
 * Mount it once on any page whose deletes should confirm through the dialog
 * rather than the native action sheet (the downloads page, the watchlist
 * detail). Stacked pages may each mount one; only the topmost draws.
 */
export const ConfirmDeleteHost: React.FC = () => {
  const id = useId();
  const [request, setRequest] = useAtom(confirmDeleteRequestAtom);
  const [hosts, setHosts] = useAtom(confirmDeleteHostsAtom);
  const clearRequest = useSetAtom(confirmDeleteRequestAtom);

  useEffect(() => {
    setHosts((list) => [...list, id]);
    return () => setHosts((list) => list.filter((h) => h !== id));
  }, [id, setHosts]);

  const isTop = hosts[hosts.length - 1] === id;
  if (!request || !isTop) return null;

  return (
    <ConfirmDialog
      visible
      destructive
      title={request.title}
      message={request.message}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      onCancel={() => clearRequest(null)}
      onConfirm={() => {
        const { onConfirm } = request;
        setRequest(null);
        onConfirm();
      }}
    />
  );
};
