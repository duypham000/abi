import { ScriptEditor } from "../../../shared/ScriptEditor";
import { useRestStore } from "../../../../store/restStore";

interface ScriptTabProps {
  mode: "pre-request" | "tests";
}

const PRE_REQUEST_HINT = "pw.env.set('key', 'value')  — set environment variable";
const TESTS_HINT = "pw.expect(response.status).toBe(200)  — assert response";

export function ScriptTab({ mode }: ScriptTabProps) {
  const preRequestScript = useRestStore((s) => s.currentRequest.preRequestScript);
  const testScript = useRestStore((s) => s.currentRequest.testScript);
  const setCurrentRequest = useRestStore((s) => s.setCurrentRequest);

  const value = mode === "pre-request" ? preRequestScript : testScript;

  const handleChange = (v: string) => {
    if (mode === "pre-request") {
      setCurrentRequest({ preRequestScript: v });
    } else {
      setCurrentRequest({ testScript: v });
    }
  };

  return (
    <ScriptEditor
      value={value}
      onChange={handleChange}
      placeholder={
        mode === "pre-request"
          ? "// Script runs before the request is sent\n// Example: pw.env.set('token', 'abc123')"
          : "// Script runs after receiving a response\n// Example: pw.expect(response.status).toBe(200)"
      }
      hint={mode === "pre-request" ? PRE_REQUEST_HINT : TESTS_HINT}
    />
  );
}
