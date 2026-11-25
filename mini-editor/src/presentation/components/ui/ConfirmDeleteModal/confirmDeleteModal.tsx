import { Button, Modal } from "antd";
import type { DeleteScope } from "@/infrastructure/api/docsApi";

export interface ConfirmDeleteWithScopeOptions {
  entityLabel: "tài liệu" | "canvas";
  title?: string | null;
  onConfirm: (scope: DeleteScope) => void | Promise<void>;
}

/**
 * Show a 2-option delete confirmation modal letting the user choose between
 * deleting only from local SQLite or deleting from both local and server/Git.
 */
export function confirmDeleteWithScope({
  entityLabel,
  title,
  onConfirm,
}: ConfirmDeleteWithScopeOptions): void {
  const displayTitle = title?.trim() || (entityLabel === "canvas" ? "Untitled Canvas" : "Untitled");

  const instance = Modal.confirm({
    title: `Xoá ${entityLabel} "${displayTitle}"?`,
    width: 460,
    content: (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        <p style={{ margin: 0 }}>Vui lòng chọn phạm vi xoá:</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
          <li>
            <strong>Chỉ xoá ở Local</strong>: Chỉ xoá khỏi thiết bị này (SQLite), giữ nguyên dữ liệu trên Server / Git.
          </li>
          <li>
            <strong>Xoá cả Local &amp; Server</strong>: Xoá vĩnh viễn trên thiết bị này và trên Server / Git workspace.
          </li>
        </ul>
      </div>
    ),
    footer: () => (
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <Button onClick={() => instance.destroy()}>Huỷ</Button>
        <Button
          onClick={() => {
            instance.destroy();
            void onConfirm("local");
          }}
        >
          Chỉ xoá ở Local
        </Button>
        <Button
          type="primary"
          danger
          onClick={() => {
            instance.destroy();
            void onConfirm("server");
          }}
        >
          Xoá cả Local &amp; Server
        </Button>
      </div>
    ),
  });
}
