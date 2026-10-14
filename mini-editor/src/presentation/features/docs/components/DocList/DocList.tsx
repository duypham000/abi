import type { DocDto } from "@/core/interfaces/docs";
import { Loading } from "@/presentation/components/ui/Loading/Loading";
import DocCard from "../DocCard";
import "./DocList.scss";

interface DocListProps {
  docs: DocDto[];
  onDelete: (id: number) => void;
  isDeleting?: boolean;
  isLoading?: boolean;
}

export default function DocList({
  docs,
  onDelete,
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

  if (docs.length === 0) {
    return (
      <div className="doc-list-empty">
        <p>No documents yet. Create your first doc!</p>
      </div>
    );
  }

  return (
    <div className="doc-list">
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
