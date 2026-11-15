import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { MethodBadge } from "../../shared/MethodBadge";
import { useRestStore } from "../../../store/restStore";
import type { ApiRequest } from "../../../types/rest";

interface RequestItemProps {
  request: ApiRequest;
  collectionId: string;
}

export function RequestItem({ request }: RequestItemProps) {
  const replaceCurrentRequest = useRestStore((s) => s.replaceCurrentRequest);

  const menuItems: MenuProps["items"] = [
    {
      key: "open",
      label: "Open in editor",
      onClick: () => replaceCurrentRequest(request),
    },
  ];

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["contextMenu"]}>
      <div
        className="request-item"
        onClick={() => replaceCurrentRequest(request)}
        title={request.name || request.url}
      >
        <MethodBadge method={request.method} size="xs" />
        <span className="request-item-name">{request.name || request.url || "Untitled"}</span>
      </div>
    </Dropdown>
  );
}
