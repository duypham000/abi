import { CheckCircleIcon, XCircleIcon } from "lucide-react";

export interface TestAssertion {
  label: string;
  passed: boolean;
  error?: string;
}

interface TestResultsProps {
  assertions: TestAssertion[];
}

export function TestResults({ assertions }: TestResultsProps) {
  if (assertions.length === 0) {
    return (
      <div className="test-results-empty">
        <p>No test results.</p>
        <p className="test-results-hint">Write assertions in the Tests tab to see results here.</p>
      </div>
    );
  }

  const passed = assertions.filter((a) => a.passed).length;
  const failed = assertions.length - passed;

  return (
    <div className="test-results">
      <div className="test-results-summary">
        <span className="test-summary-pass">
          <CheckCircleIcon size={14} /> {passed} passed
        </span>
        {failed > 0 && (
          <span className="test-summary-fail">
            <XCircleIcon size={14} /> {failed} failed
          </span>
        )}
      </div>
      <ul className="test-results-list">
        {assertions.map((a, i) => (
          <li key={i} className={`test-result-item ${a.passed ? "pass" : "fail"}`}>
            {a.passed ? (
              <CheckCircleIcon size={14} className="test-icon pass" />
            ) : (
              <XCircleIcon size={14} className="test-icon fail" />
            )}
            <span className="test-label">{a.label}</span>
            {!a.passed && a.error && (
              <span className="test-error">{a.error}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
