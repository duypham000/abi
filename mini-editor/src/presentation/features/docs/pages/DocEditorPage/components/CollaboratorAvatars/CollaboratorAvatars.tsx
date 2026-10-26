import { Tooltip } from "antd";
import type { CollaboratorUser } from "@/presentation/features/docs/hooks/useYjsCollaboration";

interface CollaboratorAvatarsProps {
  collaborators: CollaboratorUser[];
}

export function CollaboratorAvatars({ collaborators }: CollaboratorAvatarsProps) {
  if (!collaborators || collaborators.length === 0) return null;

  const MAX_VISIBLE = 4;
  const visible = collaborators.slice(0, MAX_VISIBLE);
  const overflow = collaborators.length - MAX_VISIBLE;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginRight: 8 }}>
      {visible.map((user, i) => (
        <Tooltip key={user.userId || i} title={user.name}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              backgroundColor: user.color,
              border: "2px solid var(--color-bg-elevated, #fff)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 600,
              color: "#fff",
              cursor: "default",
              marginLeft: i === 0 ? 0 : -8,
              zIndex: MAX_VISIBLE - i,
              position: "relative",
              userSelect: "none",
            }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
        </Tooltip>
      ))}
      {overflow > 0 && (
        <Tooltip title={collaborators.slice(MAX_VISIBLE).map((u) => u.name).join(", ")}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              backgroundColor: "var(--color-text-tertiary, #999)",
              border: "2px solid var(--color-bg-elevated, #fff)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
              color: "#fff",
              cursor: "default",
              marginLeft: -8,
              position: "relative",
              userSelect: "none",
            }}
          >
            +{overflow}
          </div>
        </Tooltip>
      )}
    </div>
  );
}
