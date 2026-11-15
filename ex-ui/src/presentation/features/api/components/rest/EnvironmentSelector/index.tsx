import { useState } from "react";
import { Button, Select, Tooltip } from "antd";
import { Settings2Icon } from "lucide-react";
import { useRestStore } from "../../../store/restStore";
import { EnvironmentModal } from "./EnvironmentModal";

export function EnvironmentSelector() {
  const environments = useRestStore((s) => s.environments);
  const activeEnvironmentId = useRestStore((s) => s.activeEnvironmentId);
  const setActiveEnvironment = useRestStore((s) => s.setActiveEnvironmentId);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="environment-selector">
      <Select
        value={activeEnvironmentId ?? "none"}
        onChange={(v) => setActiveEnvironment(v === "none" ? null : v)}
        size="small"
        style={{ minWidth: 160 }}
        options={[
          { label: "No Environment", value: "none" },
          ...environments.map((e) => ({ label: e.name, value: e.id })),
        ]}
      />
      <Tooltip title="Manage Environments">
        <Button
          size="small"
          type="text"
          icon={<Settings2Icon size={14} />}
          onClick={() => setModalOpen(true)}
        />
      </Tooltip>
      <EnvironmentModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
