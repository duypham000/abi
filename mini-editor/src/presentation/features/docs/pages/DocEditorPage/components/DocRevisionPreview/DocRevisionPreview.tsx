import { useMemo } from "react";
import { Modal, Button, Spin, Typography, message } from "antd";
import { useGetDocRevisionQuery, useRestoreDocRevisionMutation } from "@/infrastructure/api/docsApi";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { workspaceSchema } from "@/presentation/components/BlockNote/useBlockNoteEditor";
import { base64ToUint8Array } from "@/core/utils/yjsUtils";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import "@blocknote/mantine/style.css";

const { Text } = Typography;

interface DocRevisionPreviewProps {
  docId: number;
  revisionId: number | null;
  onClose: () => void;
  onRestored?: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useRevisionPreviewEditor(yjsSnapshot: string | null | undefined): any {
  const { tempDoc, fakeProvider } = useMemo(() => {
    const doc = new Y.Doc();
    if (yjsSnapshot) {
      try {
        Y.applyUpdate(doc, base64ToUint8Array(yjsSnapshot));
      } catch {
        // snapshot may be empty or corrupted — render blank
      }
    }
    const awareness = new Awareness(doc);
    const provider = { awareness, destroy: () => awareness.destroy() };
    return { tempDoc: doc, fakeProvider: provider };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yjsSnapshot]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = useCreateBlockNote({
    schema: workspaceSchema,
    collaboration: {
      provider: fakeProvider as never,
      fragment: tempDoc.getXmlFragment("document-store"),
      user: { name: "Preview", color: "#999" },
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as any;

  return editor;
}

function RevisionContent({ yjsSnapshot }: { yjsSnapshot: string | null | undefined }) {
  const editor = useRevisionPreviewEditor(yjsSnapshot);
  return (
    <div
      style={{
        maxHeight: "60vh",
        overflow: "auto",
        border: "1px solid #f0f0f0",
        borderRadius: 6,
        padding: "8px 0",
      }}
    >
      <BlockNoteView editor={editor} editable={false} theme="light" />
    </div>
  );
}

export function DocRevisionPreview({ docId, revisionId, onClose, onRestored }: DocRevisionPreviewProps) {
  const { data: revision, isLoading } = useGetDocRevisionQuery(
    { docId, revisionId: revisionId! },
    { skip: revisionId == null }
  );
  const [restore, { isLoading: isRestoring }] = useRestoreDocRevisionMutation();

  async function handleRestore() {
    if (!revision) return;
    try {
      await restore({ docId, revisionId: revision.id }).unwrap();
      message.success("Đã khôi phục về phiên bản này");
      onRestored?.();
      onClose();
    } catch {
      message.error("Khôi phục thất bại");
    }
  }

  const title = revision
    ? `${revision.title || "Untitled"} · ${formatDate(revision.changedAt)}`
    : "Xem nội dung";

  return (
    <Modal
      open={revisionId != null}
      onCancel={onClose}
      title={title}
      width={760}
      destroyOnHidden
      footer={
        revision
          ? [
              <Button key="close" onClick={onClose}>
                Đóng
              </Button>,
              <Button
                key="restore"
                type="primary"
                loading={isRestoring}
                onClick={handleRestore}
              >
                Khôi phục về phiên bản này
              </Button>,
            ]
          : null
      }
    >
      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Spin />
        </div>
      ) : revision ? (
        <div>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Lưu bởi <strong>{revision.changedBy}</strong>
            </Text>
          </div>
          {revision.yjsSnapshot ? (
            <RevisionContent yjsSnapshot={revision.yjsSnapshot} />
          ) : (
            <div
              style={{
                maxHeight: "60vh",
                overflow: "auto",
                border: "1px solid #f0f0f0",
                borderRadius: 6,
                padding: 16,
                whiteSpace: "pre-wrap",
                fontSize: 13,
                color: "#444",
              }}
            >
              {revision.plainText || <Text type="secondary">Không có nội dung</Text>}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
