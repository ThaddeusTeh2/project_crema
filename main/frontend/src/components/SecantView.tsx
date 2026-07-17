import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { SecantState, SecantRecordResponse } from "@/types";
import { api } from "@/lib/api";

interface SecantViewProps {
  state: SecantState;
  targetTime: number;
  onStateUpdate: (state: SecantState) => void;
  onConverged: () => void;
}

export function SecantView({ state, targetTime, onStateUpdate, onConverged }: SecantViewProps) {
  const [shotTime, setShotTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRecord = async () => {
    const t = parseFloat(shotTime);
    if (isNaN(t) || t <= 0) return;

    setLoading(true);
    setError("");
    try {
      const result: SecantRecordResponse = await api.secant.record(t);
      const newState: SecantState = {
        ...state,
        converged: result.converged,
        next_grind: result.next_grind,
        iteration: result.iteration,
        error: result.error,
        history: [
          ...state.history,
          {
            iteration: result.iteration,
            grind: state.next_grind || "?",
            time: t,
            error: t - targetTime,
          },
        ],
      };
      onStateUpdate(newState);
      setShotTime("");

      if (result.converged) {
        onConverged();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record shot");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Secant Method</span>
          {state.converged ? (
            <Badge variant="success">Converged</Badge>
          ) : (
            <Badge variant="secondary">Dialing In</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Target: <span className="font-semibold text-coffee">{targetTime}s</span>
          {" "}&mdash; Each shot refines the grind estimate using linear interpolation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.history.length > 0 && (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Grind</th>
                  <th className="text-left px-3 py-2">Time</th>
                  <th className="text-left px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {state.history.map((h) => (
                  <tr key={h.iteration} className="border-t">
                    <td className="px-3 py-2">{h.iteration}</td>
                    <td className="px-3 py-2 font-mono font-medium">{h.grind}</td>
                    <td className="px-3 py-2">{h.time}s</td>
                    <td className="px-3 py-2">
                      <span className={Math.abs(h.time - targetTime) <= 1 ? "text-green-600" : "text-orange-600"}>
                        {h.time > targetTime ? "+" : ""}
                        {(h.time - targetTime).toFixed(1)}s
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!state.converged && (
          <div className="space-y-3 pt-2">
            {state.next_grind && (
              <div className="text-center bg-coffee/5 rounded-lg p-3 border border-coffee/20">
                <p className="text-sm text-muted-foreground">Pull next shot at</p>
                <p className="text-3xl font-bold text-coffee">{state.next_grind}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Input
                type="number"
                step="0.1"
                placeholder="Shot time (seconds)"
                value={shotTime}
                onChange={(e) => setShotTime(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRecord()}
              />
              <Button variant="coffee" onClick={handleRecord} disabled={loading || !shotTime}>
                {loading ? "..." : "Record"}
              </Button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        {state.converged && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-green-700 font-medium">
              Shot time dialed in — {(state.history[state.history.length - 1]?.time ?? 0).toFixed(1)}s
            </p>
            <p className="text-green-600 text-sm mt-1">
              Grind: {state.history[state.history.length - 1]?.grind}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}