import { useState } from "react";
import { Drawer, Button, Spin, Empty, Tooltip, message, Modal, Upload, Alert, Descriptions, Tag } from "antd";
import { HistoryOutlined, EyeOutlined, RollbackOutlined, CloudUploadOutlined, InboxOutlined } from "@ant-design/icons";
import {
  useListDocRevisionsQuery,
  useRestoreDocRevisionMutation,
  useAnalyzeBinRevisionMutation,
  useRestoreBinRevisionMutation,
} from "@/infrastructure/api/docsApi";
import type { DocRevisionSummaryDto } from "@/core/interfaces/docs";
import { DocRevisionPreview } from "../DocRevisionPreview";

interface DocRevisionPanelProps {
  docId: number;
  open: boolean;
  onClose: () => void;
  onRestored?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const COLORS = [
  "#e03131", "#c2255c", "#9c36b5", "#6741d9", "#3b5bdb",
  "#1971c2", "#0c8599", "#2f9e44", "#e8590c", "#f08c00",
];

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const period = h >= 12 ? "CH" : "SA";
  const hour = h % 12 || 12;
  return `${hour}:${m} ${period}`;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return "Hôm nay";
  if (sameDay(d, yesterday)) return "Hôm qua";

  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "long", year: "numeric" });
}

function groupByDate(revisions: DocRevisionSummaryDto[]): [string, DocRevisionSummaryDto[]][] {
  const map = new Map<string, DocRevisionSummaryDto[]>();
  for (const rev of revisions) {
    const d = new Date(rev.changedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(rev);
  }
  return Array.from(map.entries());
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DocRevisionPanel({ docId, open, onClose, onRestored }: DocRevisionPanelProps) {
  const [page, setPage] = useState(0);
  const [previewRevisionId, setPreviewRevisionId] = useState<number | null>(null);

  // States for binary backup recovery
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading } = useListDocRevisionsQuery(
    { docId, page, size: 20 },
    { skip: !open || docId < 0 }
  );
  const [restore, { isLoading: isRestoring }] = useRestoreDocRevisionMutation();
  const [analyzeBin, { data: analysis, isLoading: isAnalyzing }] = useAnalyzeBinRevisionMutation();
  const [restoreBin, { isLoading: isRestoringBin }] = useRestoreBinRevisionMutation();

  const revisions: DocRevisionSummaryDto[] = (data?.items as DocRevisionSummaryDto[] | undefined) ?? [];
  const total = data?.total ?? 0;
  const groups = groupByDate(revisions);

  async function handleRestore(rev: DocRevisionSummaryDto, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await restore({ docId, revisionId: rev.id }).unwrap();
      message.success("Đã khôi phục");
      onRestored?.();
      onClose();
    } catch {
      message.error("Khôi phục thất bại");
    }
  }

  async function handleFileChange(selectedFile: File) {
    setFile(selectedFile);
    try {
      await analyzeBin({ docId, file: selectedFile }).unwrap();
    } catch (err: any) {
      message.error(err?.data?.error || "Phân tích file thất bại");
    }
  }

  async function handleRestoreBin() {
    if (!file) return;
    try {
      await restoreBin({ docId, file }).unwrap();
      message.success("Khôi phục tài liệu từ file nhị phân thành công");
      setIsModalOpen(false);
      setFile(null);
      onRestored?.();
      onClose();
    } catch (err: any) {
      message.error(err?.data?.error || "Khôi phục từ file nhị phân thất bại");
    }
  }

  return (
    <>
      <Drawer
        title={
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HistoryOutlined />
            Lịch sử phiên bản
          </span>
        }
        placement="right"
        size={360}
        open={open}
        onClose={onClose}
        styles={{ body: { padding: 0, overflowY: "auto" } }}
      >
        {/* Binary backup recovery trigger */}
        <div style={{ padding: 16, borderBottom: "1px solid var(--color-border, #f0f0f0)", background: "#fafafa" }}>
          <Button
            type="dashed"
            block
            icon={<CloudUploadOutlined />}
            onClick={() => {
              setIsModalOpen(true);
              setFile(null);
            }}
          >
            Nhập file backup (.bin)
          </Button>
        </div>

        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Spin />
          </div>
        ) : revisions.length === 0 ? (
          <Empty
            description="Chưa có lịch sử chỉnh sửa"
            style={{ marginTop: 56 }}
          />
        ) : (
          <div style={{ paddingBottom: 16 }}>
            {groups.map(([dateKey, items]) => (
              <div key={dateKey}>
                {/* Date separator */}
                <div
                  style={{
                    padding: "12px 16px 6px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--color-text-tertiary, #999)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: "1px solid var(--color-border, #f0f0f0)",
                    marginBottom: 4,
                  }}
                >
                  {formatDateLabel(items[0].changedAt)}
                </div>

                {/* Revision items */}
                {items.map((rev) => (
                  <div
                    key={rev.id}
                    onClick={() => setPreviewRevisionId(rev.id)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 16px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--color-border, #f0f0f0)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background =
                        "var(--color-bg-hover, #f5f5f5)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = "";
                    }}
                  >
                    {/* Author badge */}
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        backgroundColor: hashColor(rev.changedBy ?? "?"),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#fff",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      {(rev.changedBy ?? "?").charAt(0).toUpperCase()}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <Tooltip title={new Date(rev.changedAt).toLocaleString("vi-VN")}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text, #222)" }}>
                            {formatTime(rev.changedAt)}
                          </span>
                        </Tooltip>
                        <span style={{ fontSize: 11, color: "var(--color-text-secondary, #666)" }}>
                          {rev.changedBy}
                        </span>
                      </div>

                      {rev.preview && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--color-text-tertiary, #999)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {rev.preview}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div
                      style={{ display: "flex", gap: 4, flexShrink: 0 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Tooltip title="Xem nội dung">
                        <Button
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewRevisionId(rev.id);
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="Khôi phục về thời điểm này">
                        <Button
                          size="small"
                          icon={<RollbackOutlined />}
                          loading={isRestoring}
                          onClick={(e) => handleRestore(rev, e)}
                        />
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Load more */}
            {total > (page + 1) * 20 && (
              <div style={{ display: "flex", justifyContent: "center", padding: "12px 16px" }}>
                <Button size="small" onClick={() => setPage((p) => p + 1)}>
                  Xem thêm
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        title="Khôi phục tài liệu từ file backup (.bin)"
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setFile(null);
        }}
        footer={[
          <Button key="cancel" onClick={() => setIsModalOpen(false)}>
            Hủy
          </Button>,
          <Button
            key="restore"
            type="primary"
            danger
            disabled={!file || isAnalyzing || isRestoringBin}
            loading={isRestoringBin}
            onClick={handleRestoreBin}
          >
            Khôi phục ghi đè
          </Button>,
        ]}
      >
        <div style={{ marginTop: 16 }}>
          <Upload.Dragger
            accept=".bin"
            beforeUpload={(selectedFile) => {
              handleFileChange(selectedFile);
              return false; // Prevent auto-upload
            }}
            showUploadList={false}
            disabled={isAnalyzing || isRestoringBin}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Nhấp hoặc kéo thả file backup .bin vào đây</p>
            <p className="ant-upload-hint">
              Hỗ trợ file backup nhị phân Yjs (.bin), cả dạng raw hoặc Gzip.
            </p>
          </Upload.Dragger>

          {isAnalyzing && (
            <div style={{ textAlign: "center", margin: "24px 0" }}>
              <Spin tip="Đang phân tích cấu trúc Yjs..." />
            </div>
          )}

          {!isAnalyzing && analysis && (
            <div style={{ marginTop: 16 }}>
              <Alert
                message="Phân tích file thành công"
                description="Hệ thống đã đọc thành công cấu trúc Yjs từ file backup."
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Descriptions bordered column={1} size="small">
                <Descriptions.Item label="Tên file">{analysis.fileName}</Descriptions.Item>
                <Descriptions.Item label="Kích thước file">
                  {(analysis.fileSize / 1024).toFixed(1)} KB
                </Descriptions.Item>
                <Descriptions.Item label="Nén Gzip">
                  {analysis.gzip ? <Tag color="green">Có</Tag> : <Tag color="orange">Không</Tag>}
                </Descriptions.Item>
                {analysis.gzip && (
                  <Descriptions.Item label="Dung lượng thực tế">
                    {(analysis.decompressedSize / 1024).toFixed(1)} KB
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Loại dữ liệu">
                  <Tag color={analysis.type === "document" ? "blue" : analysis.type === "canvas" ? "purple" : "default"}>
                    {analysis.type.toUpperCase()}
                  </Tag>
                </Descriptions.Item>
                {analysis.type === "document" && (
                  <Descriptions.Item label="Độ dài text">
                    {analysis.textLength} ký tự
                  </Descriptions.Item>
                )}
                {analysis.type === "canvas" && (
                  <Descriptions.Item label="Số phần tử vẽ (Canvas)">
                    {analysis.canvasElementCount}
                  </Descriptions.Item>
                )}
                {analysis.previewText && (
                  <Descriptions.Item label="Bản xem trước nội dung">
                    <div style={{ maxHeight: 150, overflowY: "auto", whiteSpace: "pre-wrap", fontStyle: "italic", fontSize: 12 }}>
                      {analysis.previewText}
                    </div>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </div>
          )}
        </div>
      </Modal>

      <DocRevisionPreview
        docId={docId}
        revisionId={previewRevisionId}
        onClose={() => setPreviewRevisionId(null)}
        onRestored={() => {
          setPreviewRevisionId(null);
          onRestored?.();
          onClose();
        }}
      />
    </>
  );
}
