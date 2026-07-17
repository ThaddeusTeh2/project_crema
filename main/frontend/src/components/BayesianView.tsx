import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { BayesianVariable, BayesianRecordResponse } from "@/types";
import { api } from "@/lib/api";

const DEFAULT_VARS: BayesianVariable[] = [
  { name: "grind", min: 1, max: 31.8 },
  { name: "dose", min: 14, max: 22 },
  { name: "yield", min: 24, max: 50 },
  { name: "temperature", min: 88, max: 98 },
  { name: "preinfusion", min: 0, max: 15 },
];

export function BayesianView() {
  const [initialized, setInitialized] = useState(false);
  const [suggestion, setSuggestion] = useState<Record<string, unknown> | null>(null);
  const [params, setParams] = useState<Record<string, number>>({});
  const [score, setScore] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ params: Record<string, number>; score: number }[]>([]);
  const [contourData, setContourData] = useState<BayesianRecordResponse["contour_data"] | null>(null);

  const handleInit = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.bayesian.init(DEFAULT_VARS);
      setInitialized(true);
      setSuggestion(result.first_suggestion || null);
      if (result.first_suggestion) {
        const p: Record<string, number> = {};
        DEFAULT_VARS.forEach((v) => {
          p[v.name] = (result.first_suggestion[v.name] as number) || (v.min + v.max) / 2;
        });
        setParams(p);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initialize");
    } finally {
      setLoading(false);
    }
  };

  const handleSuggest = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.bayesian.suggest();
      setSuggestion(result.suggestion || null);
      if (result.suggestion) {
        const p: Record<string, number> = {};
        DEFAULT_VARS.forEach((v) => {
          p[v.name] = (result.suggestion[v.name] as number) || (v.min + v.max) / 2;
        });
        setParams(p);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get suggestion");
    } finally {
      setLoading(false);
    }
  };

  const handleRecord = async () => {
    const s = parseFloat(score);
    if (isNaN(s) || s < 1 || s > 10) return;

    setLoading(true);
    setError("");
    try {
      const result = await api.bayesian.record(params, s);
      setHistory((prev) => [...prev, { params: { ...params }, score: s }]);
      setSuggestion(result.suggestion || null);
      if (result.suggestion) {
        const p: Record<string, number> = {};
        DEFAULT_VARS.forEach((v) => {
          p[v.name] = (result.suggestion[v.name] as number) || (v.min + v.max) / 2;
        });
        setParams(p);
      }
      setContourData(result.contour_data || null);
      setScore("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Bayesian Optimization</span>
          {initialized && <Badge variant="secondary">Active</Badge>}
        </CardTitle>
        <CardDescription>
          Multi-variable optimization using Gaussian Process regression with Expected Improvement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!initialized ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground mb-4">
              Start Bayesian optimization to find the best recipe across multiple variables.
            </p>
            <Button variant="coffee" onClick={handleInit} disabled={loading}>
              {loading ? "Initializing..." : "Start Bayesian Optimization"}
            </Button>
          </div>
        ) : (
          <>
            <div className="border rounded-md p-3 bg-muted/30">
              <p className="text-sm font-medium mb-2">Next Experiment</p>
              <div className="grid grid-cols-2 gap-2">
                {DEFAULT_VARS.map((v) => (
                  <div key={v.name} className="text-sm">
                    <span className="text-muted-foreground capitalize">{v.name}:</span>{" "}
                    <span className="font-mono font-medium">
                      {params[v.name] !== undefined ? Number(params[v.name]).toFixed(1) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Taste Score (1-10)</label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="8.5"
                />
              </div>
              <Button variant="coffee" onClick={handleRecord} disabled={loading || !score}>
                {loading ? "..." : "Record"}
              </Button>
            </div>

            {history.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">History ({history.length} shots)</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {history.map((h, i) => (
                    <div key={i} className="flex justify-between text-sm bg-muted/50 rounded px-2 py-1">
                      <span className="font-mono">
                        {Object.values(h.params)
                          .slice(0, 3)
                          .map((v) => Number(v).toFixed(1))
                          .join(" / ")}
                      </span>
                      <span className="font-semibold text-coffee">{h.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button variant="outline" size="sm" className="w-full" onClick={handleSuggest} disabled={loading}>
              Get New Suggestion
            </Button>

            {contourData && contourData.z.length > 0 && (
              <div className="text-xs text-muted-foreground text-center">
                Contour data ready — showing grind vs dose predicted taste surface.
              </div>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}