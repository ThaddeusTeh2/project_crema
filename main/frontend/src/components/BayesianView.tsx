import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Target, TrendingUp, Beaker } from "lucide-react";
import type { BayesianVariable, EIRationale, CoffeeSummary, TasteComponents } from "@/types";
import { api } from "@/lib/api";
import Plotly from "plotly.js-dist-min";

const DEFAULT_VARS: BayesianVariable[] = [
  { name: "grind", min: 1, max: 31.8 },
  { name: "dose", min: 14, max: 22 },
  { name: "yield", min: 24, max: 50 },
  { name: "temperature", min: 88, max: 98 },
  { name: "preinfusion", min: 0, max: 15 },
];

const TASTE_COMPONENTS = [
  { key: "sweetness", label: "Sweetness" },
  { key: "acidity", label: "Acidity" },
  { key: "bitterness", label: "Bitterness" },
  { key: "body", label: "Body" },
  { key: "balance", label: "Balance" },
] as const;

const CONFIDENCE_COLORS: Record<string, string> = {
  Low: "bg-red-100 text-red-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Good: "bg-blue-100 text-blue-800",
  High: "bg-green-100 text-green-800",
};

export function BayesianView() {
  const [coffeeName, setCoffeeName] = useState("");
  const [coffees, setCoffees] = useState<CoffeeSummary[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [suggestion, setSuggestion] = useState<Record<string, unknown> | null>(null);
  const [params, setParams] = useState<Record<string, number>>({});
  const [score, setScore] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ params: Record<string, number>; score: number }[]>([]);
  const [contourData, setContourData] = useState<{
    x: number[]; y: number[]; z: number[][]; z_std: number[][];
    x_label: string; y_label: string; z_label: string; z_std_label: string;
  } | null>(null);
  const [eiRationale, setEiRationale] = useState<EIRationale | null>(null);
  const [confidence, setConfidence] = useState("—");
  const [totalObs, setTotalObs] = useState(0);
  const [seedCount, setSeedCount] = useState(0);
  const [validForModel, setValidForModel] = useState(true);
  const [validReason, setValidReason] = useState("");
  const [tasteComponents, setTasteComponents] = useState<TasteComponents>({});
  const [shotTime, setShotTime] = useState("");
  const contourRef = useRef<HTMLDivElement>(null);

  const loadCoffees = async () => {
    try {
      const data = await api.bayesian.coffees();
      setCoffees(data);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadCoffees(); }, []);

  useEffect(() => {
    if (contourData && contourRef.current) {
      const tracePred: Plotly.Data = {
        z: contourData.z,
        x: contourData.x.map((v) => Number(v.toFixed(1))),
        y: contourData.y.map((v) => Number(v.toFixed(1))),
        type: "contour" as const,
        colorscale: "Viridis",
        name: "Predicted Score",
        contours: { coloring: "heatmap" as const },
        colorbar: { title: { text: "Score" }, x: 1.05 },
      } as Plotly.Data;
      const traceStd: Plotly.Data = {
        z: contourData.z_std,
        x: contourData.x.map((v) => Number(v.toFixed(1))),
        y: contourData.y.map((v) => Number(v.toFixed(1))),
        type: "contour" as const,
        colorscale: "Reds",
        name: "Uncertainty",
        contours: { coloring: "heatmap" as const },
        colorbar: { title: { text: "σ" }, x: 1.15 },
        visible: "legendonly" as const,
      } as Plotly.Data;
      const layout: Partial<Plotly.Layout> = {
        xaxis: { title: { text: "Grind" } },
        yaxis: { title: { text: "Dose (g)" } },
        margin: { l: 50, r: 50, t: 20, b: 40 },
        height: 320,
        legend: { orientation: "h" as const, y: -0.15 },
      };
      Plotly.newPlot(contourRef.current, [tracePred, traceStd], layout, {
        displayModeBar: false,
        responsive: true,
      });
    }
  }, [contourData]);

  const handleSelectCoffee = async (name: string) => {
    setCoffeeName(name);
    setError("");

    try {
      const state = await api.bayesian.state(name).catch(() => null);
      if (state && state.initialized) {
        setInitialized(true);
        setHistory(
          state.history
            .filter((h) => !h.unobserved)
            .map((h) => ({
              params: DEFAULT_VARS.reduce((acc, v) => {
                acc[v.name] = Number(h[v.name] || 0);
                return acc;
              }, {} as Record<string, number>),
              score: Number(h.score),
            }))
        );
        setConfidence(state.confidence);
        setTotalObs(state.total_observations);
        handleSuggest();
        return;
      }
    } catch { /* no saved session */ }

    setInitialized(false);
    setSuggestion(null);
    setHistory([]);
    setContourData(null);
    setConfidence("—");
    setTotalObs(0);

    const coffee = coffees.find((c) => c.coffee_name === name);
    setSeedCount(coffee?.valid_for_model ?? 0);
  };

  const handleInit = async () => {
    if (!coffeeName) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.bayesian.init(coffeeName);
      setInitialized(true);
      setConfidence(result.confidence);
      setTotalObs(result.total_observations);
      setSeedCount(result.seed_count);
      if (result.first_suggestion) {
        setSuggestion(result.first_suggestion);
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
    if (!coffeeName) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.bayesian.suggest(coffeeName);
      setSuggestion(result.suggestion || null);
      if (result.suggestion) {
        const p: Record<string, number> = {};
        DEFAULT_VARS.forEach((v) => {
          p[v.name] = (result.suggestion[v.name] as number) || (v.min + v.max) / 2;
        });
        setParams(p);
        setEiRationale((result.suggestion.ei_rationale as EIRationale) || null);
        setConfidence((result.suggestion.confidence as string) || confidence);
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
    if (!coffeeName) return;

    setLoading(true);
    setError("");
    try {
      const hasTasteComponents = Object.values(tasteComponents).some((v) => v != null);
      const result = await api.bayesian.record(coffeeName, params, s, {
        shot_time: shotTime ? parseFloat(shotTime) : undefined,
        valid_for_model: validForModel,
        valid_reason: validForModel ? undefined : (validReason || undefined),
        taste_components: hasTasteComponents ? tasteComponents : undefined,
      });

      if (result.valid_for_model) {
        setHistory((prev) => [...prev, { params: { ...params }, score: s }]);
      }

      setConfidence(result.confidence);
      setTotalObs(result.total_observations);

      if (result.suggestion) {
        setSuggestion(result.suggestion);
        const p: Record<string, number> = {};
        DEFAULT_VARS.forEach((v) => {
          p[v.name] = (result.suggestion![v.name] as number) || (v.min + v.max) / 2;
        });
        setParams(p);
        setEiRationale(result.ei_rationale || null);
      } else {
        setSuggestion(null);
        setParams({});
      }

      if (result.contour_data) {
        setContourData(result.contour_data as typeof contourData);
      }

      setScore("");
      setShotTime("");
      setTasteComponents({});
      setValidReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    await api.bayesian.reset(coffeeName);
    setInitialized(false);
    setSuggestion(null);
    setParams({});
    setHistory([]);
    setContourData(null);
    setEiRationale(null);
    setConfidence("—");
    setTotalObs(0);
    setSeedCount(0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Bayesian Optimization</span>
          {initialized && (
            <div className="flex items-center gap-2">
              <Badge className={CONFIDENCE_COLORS[confidence] || "bg-gray-100"}>
                {confidence} confidence
              </Badge>
              <Button variant="ghost" size="sm" className="text-xs text-red-500" onClick={handleReset}>
                Reset
              </Button>
            </div>
          )}
        </CardTitle>
        <CardDescription>
          Per-coffee Gaussian Process model. Every shot with a taste score trains the GP. Recipes are bookmarks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">Coffee</Label>
          <Select value={coffeeName} onValueChange={handleSelectCoffee}>
            <SelectTrigger>
              <SelectValue placeholder="Select a coffee..." />
            </SelectTrigger>
            <SelectContent>
              {coffees.map((c) => (
                <SelectItem key={c.coffee_name} value={c.coffee_name}>
                  {c.coffee_name} ({c.total_shots} shots, {c.valid_for_model} rated)
                </SelectItem>
              ))}
              {coffees.length === 0 && (
                <SelectItem value="__none__" disabled>
                  No shots logged yet. Start a pipeline first.
                </SelectItem>
              )}
            </SelectContent>
          </Select>

          {coffeeName && !initialized && (
            <div className="mt-3 space-y-2">
              {seedCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded p-2">
                  <Target className="w-4 h-4" />
                  <span>
                    <strong>{seedCount}</strong> valid shots available to seed the model
                    from your existing shot history.
                  </span>
                </div>
              )}
              <Button variant="coffee" onClick={handleInit} disabled={loading} className="w-full">
                {loading ? "Initializing..." : (
                  `Start Optimization${seedCount > 0 ? ` (with ${seedCount} seed${seedCount !== 1 ? "s" : ""})` : ""}`
                )}
              </Button>
            </div>
          )}
        </div>

        {initialized && (
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-coffee rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (totalObs / 15) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {totalObs} / 15
              </span>
              <Beaker className="w-3.5 h-3.5 text-muted-foreground" />
            </div>

            {suggestion && (
              <div className="border rounded-md p-4 bg-coffee/5">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-coffee" />
                  Recommended Shot
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {DEFAULT_VARS.map((v) => (
                    <div key={v.name} className="flex justify-between text-sm">
                      <span className="text-muted-foreground capitalize">{v.name}:</span>
                      <span className="font-mono font-semibold">
                        {v.name === "grind" && suggestion.grind_display
                          ? String(suggestion.grind_display)
                          : params[v.name] !== undefined
                            ? `${v.name === "temperature" ? Math.round(Number(params[v.name])) : Number(params[v.name]).toFixed(1)}${
                                v.name === "dose" || v.name === "yield" ? "g" : v.name === "temperature" ? "°C" : v.name === "preinfusion" ? "s" : ""
                              }`
                            : "—"}
                      </span>
                    </div>
                  ))}
                </div>

                {eiRationale && (
                  <div className="mt-3 pt-3 border-t text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Predicted taste:</span>
                      <span className="font-mono">
                        {eiRationale.predicted_score} ± {eiRationale.uncertainty}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current best:</span>
                      <span className="font-mono">{eiRationale.current_best}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expected improvement:</span>
                      <span className="font-mono text-coffee font-semibold">
                        +{eiRationale.expected_improvement}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 border rounded-md p-3">
              <p className="text-sm font-medium">Record Shot</p>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Taste Score (1-10)</Label>
                  <Input
                    type="number" min={1} max={10} step={0.5}
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder="8.5"
                  />
                </div>
                <div className="w-24">
                  <Label className="text-xs">Time (s)</Label>
                  <Input
                    type="number" min={0} max={120} step={0.5}
                    value={shotTime}
                    onChange={(e) => setShotTime(e.target.value)}
                    placeholder="30"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Taste Breakdown (optional)</Label>
                <div className="grid grid-cols-5 gap-1 mt-1">
                  {TASTE_COMPONENTS.map((tc) => (
                    <div key={tc.key}>
                      <Label className="text-[10px] text-muted-foreground">{tc.label}</Label>
                      <Input
                        type="number" min={1} max={10} step={0.5}
                        value={tasteComponents[tc.key as keyof TasteComponents] ?? ""}
                        onChange={(e) =>
                          setTasteComponents((prev) => ({
                            ...prev,
                            [tc.key]: e.target.value ? parseFloat(e.target.value) : undefined,
                          }))
                        }
                        className="h-7 text-xs px-1"
                        placeholder="—"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="valid-model"
                  checked={validForModel}
                  onCheckedChange={(v) => setValidForModel(v === true)}
                />
                <Label htmlFor="valid-model" className="text-xs">
                  Use this shot to train the model
                </Label>
              </div>

              {!validForModel && (
                <Input
                  placeholder="Reason (e.g., channeling, scale error)"
                  value={validReason}
                  onChange={(e) => setValidReason(e.target.value)}
                  className="h-7 text-xs"
                />
              )}

              <Button
                variant="coffee"
                className="w-full"
                onClick={handleRecord}
                disabled={loading || !score}
              >
                {loading ? "Saving..." : "Record Shot"}
              </Button>
            </div>

            {history.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5" />
                    History ({history.length} rated shots)
                  </p>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {history.map((h, i) => (
                    <div key={i} className="flex justify-between text-sm bg-muted/50 rounded px-2 py-1">
                      <span className="font-mono text-xs">
                        {h.params.grind !== undefined
                          ? `${Number(h.params.grind).toFixed(1)} / ${Number(h.params.dose).toFixed(1)}g / ${Number(h.params.yield).toFixed(1)}g`
                          : `#${i + 1}`}
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

            <div ref={contourRef} />

            {contourData && contourData.z_std.length > 0 && (
              <div className="text-xs text-muted-foreground text-center">
                Contour: grind vs dose predicted taste surface (toggle "Uncertainty" in legend for model uncertainty).
              </div>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}