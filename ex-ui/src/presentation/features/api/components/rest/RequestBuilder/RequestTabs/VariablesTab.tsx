import { KeyValueEditor } from "../../../shared/KeyValueEditor";
import { useRestStore } from "../../../../store/restStore";

export function VariablesTab() {
  const variables = useRestStore((s) => s.currentRequest.variables);
  const setCurrentRequest = useRestStore((s) => s.setCurrentRequest);

  return (
    <div className="request-tab-content">
      <div className="variables-hint">
        Variables defined here override environment variables for this request.
        Use <code>{"{{varName}}"}</code> syntax in URL, headers, and body.
      </div>
      <KeyValueEditor
        rows={variables}
        onChange={(rows) => setCurrentRequest({ variables: rows })}
        keyPlaceholder="Variable name"
        valuePlaceholder="Value"
        showDescription
      />
    </div>
  );
}
