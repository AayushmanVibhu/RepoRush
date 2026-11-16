import { Check, XCircle } from "lucide-react";
import type { TestRow } from "./challenges";

export function TestCaseResults({ rows }: { rows: TestRow[] }) {
  return (
    <div className="test-case-list">
      {rows.map((row, index) => (
        <article
          key={`${index}:${row.name}`}
          className={`test-case ${row.pass ? "pass" : "fail"}`}
        >
          <div className="test-case-heading">
            {row.pass ? (
              <Check className="green" />
            ) : (
              <XCircle className={row.skipped ? "" : "red"} />
            )}
            <div>
              <small>
                {row.kind === "error"
                  ? "Program error"
                  : row.kind === "static"
                    ? `Source check ${index + 1}`
                    : `Test case ${index + 1}`}
              </small>
              <b>{row.name.replace(/^test_/, "").replaceAll("_", " ")}</b>
            </div>
            <em className={row.pass ? "green" : row.skipped ? "" : "red"}>
              {row.skipped
                ? "Not run"
                : row.pass
                  ? "Passed"
                  : row.kind === "error"
                    ? "Error"
                    : "Failed"}
            </em>
          </div>
          {row.detail !== "Passed" && <p>{row.detail}</p>}
          {(row.expected !== undefined || row.actual !== undefined) && (
            <div className="assertion-values">
              {row.expected !== undefined && (
                <div>
                  <small>Expected</small>
                  <pre>{row.expected}</pre>
                </div>
              )}
              {row.actual !== undefined && (
                <div>
                  <small>Your output</small>
                  <pre>{row.actual}</pre>
                </div>
              )}
            </div>
          )}
          {row.diagnostic && (
            <details
              className="test-diagnostic"
              open={
                row.kind === "error" ||
                (row.expected === undefined && row.actual === undefined)
              }
            >
              <summary>Error details</summary>
              <pre>{row.diagnostic}</pre>
            </details>
          )}
          {row.testCode && (
            <details open={!row.pass}>
              <summary>View test case</summary>
              <pre>{row.testCode}</pre>
            </details>
          )}
        </article>
      ))}
    </div>
  );
}
