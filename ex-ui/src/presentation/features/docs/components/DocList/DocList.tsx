import type { DocDto } from "@/core/interfaces/docs";
import type { DraftSummary } from "@/infrastructure/tauri/docCacheService";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import DocCard from "../DocCard";
import "./DocList.scss";

interface DocListProps {
  docs: DocDto[];
  drafts?: DraftSummary[];
  onDelete: (id: number) => void;
  onDeleteDraft?: (localId: string) => void;
  isDeleting?: boolean;
  isLoading?: boolean;
}

export default function DocList({
  docs,
  drafts = [],
  onDelete,
  onDeleteDraft,
  isDeleting,
  isLoading,
}: DocListProps) {
  if (isLoading) {
    return (
      <div className="doc-list-empty">
        <Loading label="Đang tải…" />
      </div>
    );
  }

  if (docs.length === 0 && drafts.length === 0) {
    return (
      <div className="doc-list-empty">
        <p>No documents yet. Create your first doc!</p>
      </div>
    );
  }

  return (
    <div className="doc-list">
      {drafts.map((draft) => (
        <DocCard
          key={`draft-${draft.id}`}
          kind="draft"
          draft={draft}
          onDelete={(id) => onDeleteDraft?.(id)}
          isDeleting={isDeleting}
        />
      ))}
      {docs.map((doc) => (
        <DocCard
          key={doc.id}
          doc={doc}
          onDelete={onDelete}
          isDeleting={isDeleting}
        />
      ))}
    </div>
  );
}
