import { KeyValueEditor } from "../../../shared/KeyValueEditor";
import { useRestStore } from "../../../../store/restStore";

export function ParamsTab() {
  const params = useRestStore((s) => s.currentRequest.params);
  const setCurrentRequest = useRestStore((s) => s.setCurrentRequest);

  return (
    <div className="request-tab-content">
      <KeyValueEditor
        rows={params}
        onChange={(rows) => setCurrentRequest({ params: rows })}
        keyPlaceholder="Parameter"
        valuePlaceholder="Value"
        showDescription
      />
    </div>
  );
}
