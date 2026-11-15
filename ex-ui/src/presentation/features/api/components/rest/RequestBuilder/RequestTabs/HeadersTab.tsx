import { KeyValueEditor } from "../../../shared/KeyValueEditor";
import { useRestStore } from "../../../../store/restStore";

export function HeadersTab() {
  const headers = useRestStore((s) => s.currentRequest.headers);
  const setCurrentRequest = useRestStore((s) => s.setCurrentRequest);

  return (
    <div className="request-tab-content">
      <KeyValueEditor
        rows={headers}
        onChange={(rows) => setCurrentRequest({ headers: rows })}
        keyPlaceholder="Header"
        valuePlaceholder="Value"
        showDescription
      />
    </div>
  );
}
