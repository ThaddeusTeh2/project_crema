import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GrindInput } from "@/components/GrindInput";
import { GrinderDisclaimer } from "@/components/GrinderDisclaimer";
import {
  Coffee, RotateCcw, Undo2, Save, CheckCircle2, CircleDashed, ArrowRight,
  ThumbsUp, ThumbsDown, AlertTriangle, Equal, XCircle, Wrench, Scale,
} from "lucide-react";
import type {
  PipelineState, PipelinePhase, SecantState, GoldenState, GoldenComparisonEntry,
  SecantRecordResponse, GoldenCompareResponse, LockedVars, TasteComponents,
} from "@/types";
import { api } from "@/lib/api";

const SHOT_QUALITIES = [
  { value: "good", label: "Good", icon: CheckCircle2, color: "text-green-600 hover:bg-green-50" },
  { value: "channeling", label: "Channeling", icon: AlertTriangle, color: "text-orange-600 hover:bg-orange-50" },
  { value: "scale_error", label: "Scale Error", icon: Scale, color: "text-red-600 hover:bg-red-50" },
  { value: "grinder_mistake", label: "Grinder Mistake", icon: Wrench, color: "text-purple-600 hover:bg-purple-50" },
  { value: "other", label: "Other", icon: XCircle, color: "text-gray-600 hover:bg-gray-50" },
] as const;

const PREFERENCES = [
  { value: "strongly_a", label: "Strongly A", weight: -2, variant: "destructive" as const },
  { value: "slightly_a", label: "Slightly A", weight: -1, variant: "outline" as const },
  { value: "same", label: "Same", weight: 0, variant: "outline" as const },
  { value: "slightly_b", label: "Slightly B", weight: 1, variant: "outline" as const },
  { value: "strongly_b", label: "Strongly B", weight: 2, variant: "secondary" as const },
];

const TASTE_COMPONENTS: { key: keyof TasteComponents; label: string }[] = [
  { key: "sweetness", label: "Sweet" },
  { key: "acidity", label: "Acid" },
  { key: "bitterness", label: "Bitter" },
  { key: "body", label: "Body" },
  { key: "balance", label: "Bal" },
];

export function PipelineView() {
  const [phase, setPhase] = useState<PipelinePhase>("setup");
  const [coffeeName, setCoffeeName] = useState("");
  const [targetTime, setTargetTime] = useState(30);
  const [lockedVars, setLockedVars] = useState<LockedVars>({ dose: 18, yield: 36, temperature: 93, preinfusion: 5 });
  const [secant, setSecant] = useState<SecantState | null>(null);
  const [golden, setGolden] = useState<GoldenState | null>(null);
  const [goldenHistory, setGoldenHistory] = useState<GoldenComparisonEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reloadState = useCallback(async () => {
    try {
      const state: PipelineState = await api.pipeline.state();
      if (state && state.phase !== "setup") {
        setPhase(state.phase);
        setCoffeeName(state.coffee_name);
        setTargetTime(state.target_time);
        setLockedVars(state.locked_vars || { dose: 18, yield: 36, temperature: 93, preinfusion: 5 });
        setSecant(state.secant);
        setGolden(state.golden);
        if (state.golden?.history) setGoldenHistory(state.golden.history);
      }
    } catch { /* no active pipeline */ }
  }, []);

  useEffect(() => { reloadState(); }, [reloadState]);

  const handleStart = async (name: string, macro: number, micro: string, target: number, lv: LockedVars) => {
    setLoading(true);
    setError("");
    try {
      const state = await api.pipeline.start({
        coffee_name: name, macro, micro, target_time: target,
        dose: lv.dose, yield: lv.yield, temperature: lv.temperature, preinfusion: lv.preinfusion,
      });
      setPhase("secant");
      setCoffeeName(name);
      setTargetTime(target);
      setLockedVars(lv);
      setSecant(state.secant);
      setGolden(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setLoading(false);
    }
  };

  const handleSecantRecord = async (shotTime: string, shotQuality: string) => {
    const t = parseFloat(shotTime);
    if (isNaN(t) || t <= 0 || !secant) return;
    setLoading(true);
    setError("");
    try {
      const result: SecantRecordResponse = await api.secant.record(t, { shot_quality: shotQuality });
      const historyEntry = { iteration: result.iteration, grind: secant.next_grind || "?", time: t, error: t - targetTime, quality: shotQuality };
      const newState: SecantState = {
        ...secant, converged: result.converged, next_grind: result.next_grind,
        iteration: result.iteration, error: result.error,
        history: [...secant.history, historyEntry],
      };
      setSecant(newState);
      if (result.converged) setPhase("golden");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record shot");
    } finally {
      setLoading(false);
    }
  };

  const handleGoldenConfigure = async () => {
    setLoading(true);
    setError("");
    try {
      await api.golden.config();
      const fullState = await api.pipeline.state();
      setGolden({ ...fullState.golden!, history: [], best_grind: null });
      setGoldenHistory([]);
      setPhase("golden");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start golden section");
    } finally {
      setLoading(false);
    }
  };

  const handleGoldenCompare = async (preference: string) => {
    if (!golden) return;
    setLoading(true);
    setError("");
    try {
      const result: GoldenCompareResponse = await api.golden.compare(preference);
      const entry: GoldenComparisonEntry = {
        iteration: golden.iteration + 1, point_a: golden.point_a || "?", point_b: golden.point_b || "?",
        preference, weight: result.weight || 0, action: result.action,
      };
      const newHistory = [...goldenHistory, entry];
      setGoldenHistory(newHistory);
      const newState: GoldenState = {
        ...golden, converged: result.converged,
        point_a: result.action === "pull_new" ? result.new_point : null,
        point_b: result.action === "pull_new" ? result.retained_point : null,
        retained_point: result.retained_point, new_point: result.new_point,
        width: result.width, iteration: golden.iteration + 1,
        history: newHistory, best_grind: result.best_grind || null,
      };
      setGolden(newState);
      if (result.converged) setPhase("recipe");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to compare");
    } finally {
      setLoading(false);
    }
  };

  const handleStartAgain = async () => {
    setLoading(true);
    try {
      await api.pipeline.reset();
      setPhase("setup"); setCoffeeName(""); setTargetTime(30);
      setLockedVars({ dose: 18, yield: 36, temperature: 93, preinfusion: 5 });
      setSecant(null); setGolden(null); setGoldenHistory([]); setError("");
    } catch {} finally { setLoading(false); }
  };

  const handleRestartPhase = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.pipeline.restartPhase();
      setPhase(result.phase as PipelinePhase);
      setSecant(result.state.secant);
      setGolden(null); setGoldenHistory([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to restart phase");
    } finally { setLoading(false); }
  };

  const getFinalGrind = (): string => {
    if (golden?.converged) return golden.best_grind || golden.retained_point || golden.point_a || "—";
    if (secant?.converged && secant.history.length > 0) {
      const good = secant.history.filter(h => h.quality !== "rejected");
      return good.length > 0 ? good[good.length - 1].grind : "—";
    }
    return "—";
  };

  const isSetupDone = phase !== "setup";
  const showSecant = phase !== "setup";
  const isSecantDone = phase === "golden" || phase === "recipe";
  const showGolden = phase === "golden" || phase === "recipe";
  const isGoldenDone = phase === "recipe" || (golden?.converged ?? false);
  const showRecipe = isGoldenDone;

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button className="underline text-xs" onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      {phase !== "setup" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Coffee className="w-5 h-5 text-coffee" />
              <div>
                <h2 className="text-lg font-semibold">{coffeeName}</h2>
                <p className="text-sm text-muted-foreground">Target: {targetTime}s</p>
              </div>
            </div>
            <div className="flex gap-2">
              {phase !== "secant" && (
                <Button variant="outline" size="sm" onClick={handleRestartPhase} disabled={loading}>
                  <Undo2 className="w-3.5 h-3.5 mr-1" />Restart This Step
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleStartAgain} disabled={loading}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" />Start Again
              </Button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <LockedVarBadge label="Dose" value={`${lockedVars.dose.toFixed(1)}g`} />
            <LockedVarBadge label="Yield" value={`${lockedVars.yield.toFixed(1)}g`} />
            <LockedVarBadge label="Temp" value={`${lockedVars.temperature}°C`} />
            <LockedVarBadge label="Preinfusion" value={`${lockedVars.preinfusion}s`} />
          </div>
        </div>
      )}

      {/* Setup */}
      <PhaseSection title="New Coffee" description="Enter your coffee name, target time, starting grind, and lock your other variables." done={isSetupDone} active={phase === "setup"}>
        {phase === "setup" ? (
          <SetupContent onStart={handleStart} lockedVars={lockedVars} setLockedVars={setLockedVars} />
        ) : (
          <SetupSummary coffeeName={coffeeName} targetTime={targetTime} lockedVars={lockedVars} onRestart={handleStartAgain} />
        )}
      </PhaseSection>

      {/* Secant */}
      {showSecant && (
        <PhaseSection title="Secant Method" description={`Dial in shot time. Target: ${targetTime}s. Only good shots feed the algorithm.`} done={isSecantDone} active={phase === "secant"}
          doneLabel={secant?.converged ? `Converged — ${secant.history.filter(h => h.quality === "good").slice(-1)[0]?.time ?? "?"}s @ ${secant.history.filter(h => h.quality === "good").slice(-1)[0]?.grind ?? "?"}` : undefined}>
          <SecantContent state={secant} targetTime={targetTime} onRecord={handleSecantRecord} disabled={isSecantDone} loading={loading} />
        </PhaseSection>
      )}

      {/* Golden */}
      {showGolden && (
        <PhaseSection title="Golden Section Search" description="Compare pairs of shots to find the best tasting grind." done={isGoldenDone} active={phase === "golden"}
          doneLabel={golden?.converged ? `Optimized — Best: ${golden.best_grind || golden.retained_point || golden.point_a || "—"}` : undefined}>
          <GoldenContent state={golden} history={goldenHistory} onConfigure={handleGoldenConfigure} onCompare={handleGoldenCompare} disabled={isGoldenDone} loading={loading} needsConfig={phase === "golden" && !golden} />
        </PhaseSection>
      )}

      {/* Save Recipe */}
      {showRecipe && (
        <PhaseSection title="Save Recipe" description="Finalize your recipe with dose, yield, temperature, preinfusion, and taste score. This shot seeds the Bayesian model." done={false} active={phase === "recipe"}>
          <SaveRecipeContent finalGrind={getFinalGrind()} lockedVars={lockedVars} onStartAgain={handleStartAgain} />
        </PhaseSection>
      )}

      <GrinderDisclaimer />
    </div>
  );
}

function LockedVarBadge({ label, value }: { label: string; value: string }) {
  return (
    <Badge variant="outline" className="text-xs gap-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-mono font-semibold">{value}</span>
    </Badge>
  );
}

function PhaseSection({ title, description, done, active, doneLabel, children }: {
  title: string; description: string; done: boolean; active: boolean; doneLabel?: string; children: React.ReactNode;
}) {
  return (
    <Card className={done ? "opacity-60" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            {done ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : active ? <CircleDashed className="w-4 h-4 text-coffee animate-pulse" /> : <CircleDashed className="w-4 h-4 text-muted-foreground" />}
            {title}
          </span>
          {done && doneLabel && <Badge variant="success" className="text-xs">{doneLabel}</Badge>}
          {!done && active && <Badge variant="secondary" className="text-xs">Active</Badge>}
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SetupContent({ onStart, lockedVars, setLockedVars }: {
  onStart: (name: string, macro: number, micro: string, target: number, lv: LockedVars) => void;
  lockedVars: LockedVars;
  setLockedVars: (lv: LockedVars) => void;
}) {
  const [name, setName] = useState("");
  const [macro, setMacro] = useState(15);
  const [micro, setMicro] = useState("E");
  const [target, setTarget] = useState(30);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-1.5 block text-muted-foreground">Coffee Name</label>
        <Input placeholder="e.g., Ethiopia Yirgacheffe" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="text-sm font-medium mb-1.5 block text-muted-foreground">Target Shot Time (seconds)</label>
        <Input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} min={15} max={60} />
      </div>
      <GrindInput macro={macro} micro={micro} onChange={(m, mi) => { setMacro(m); setMicro(mi); }} />
      <div>
        <label className="text-sm font-medium mb-1.5 block text-muted-foreground">Locked Variables (keep these constant)</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Dose (g)</label>
            <Input type="number" step="0.1" value={lockedVars.dose} onChange={(e) => setLockedVars({ ...lockedVars, dose: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Yield (g)</label>
            <Input type="number" step="0.1" value={lockedVars.yield} onChange={(e) => setLockedVars({ ...lockedVars, yield: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Temperature (°C)</label>
            <Input type="number" step="1" value={lockedVars.temperature} onChange={(e) => setLockedVars({ ...lockedVars, temperature: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Preinfusion (s)</label>
            <Input type="number" step="1" value={lockedVars.preinfusion} onChange={(e) => setLockedVars({ ...lockedVars, preinfusion: Number(e.target.value) })} />
          </div>
        </div>
      </div>
      <Button variant="coffee" className="w-full" disabled={!name.trim()} onClick={() => onStart(name.trim(), macro, micro, target, lockedVars)}>
        Start Dialing In
      </Button>
    </div>
  );
}

function SetupSummary({ coffeeName, targetTime, lockedVars, onRestart }: { coffeeName: string; targetTime: number; lockedVars: LockedVars; onRestart: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <p className="text-sm">{coffeeName}</p>
        <p className="text-xs text-muted-foreground">Target: {targetTime}s</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRestart}><RotateCcw className="w-3.5 h-3.5 mr-1" />Start Over</Button>
    </div>
  );
}

function SecantContent({ state, targetTime, onRecord, disabled, loading }: {
  state: SecantState | null; targetTime: number; onRecord: (time: string, quality: string) => void; disabled: boolean; loading: boolean;
}) {
  const [shotTime, setShotTime] = useState("");
  const [selectedQuality, setSelectedQuality] = useState("good");

  if (!state) return null;

  return (
    <div className="space-y-3">
      {state.history.length > 0 && (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Grind</th>
                <th className="text-left px-3 py-2">Time</th>
                <th className="text-left px-3 py-2">Error</th>
                <th className="text-left px-3 py-2">Quality</th>
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
                      {h.time > targetTime ? "+" : ""}{(h.time - targetTime).toFixed(1)}s
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {h.quality === "good" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    ) : (
                      <Badge variant="destructive" className="text-[10px] px-1 py-0">{h.quality?.replace("_", " ")}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!disabled && !state.converged && (
        <>
          {state.next_grind && (
            <div className="text-center bg-coffee/5 rounded-lg p-3 border border-coffee/20">
              <p className="text-sm text-muted-foreground">Pull next shot at</p>
              <p className="text-3xl font-bold text-coffee">{state.next_grind}</p>
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Shot Quality</label>
            <div className="flex gap-1 flex-wrap">
              {SHOT_QUALITIES.map((sq) => {
                const Icon = sq.icon;
                return (
                  <Button
                    key={sq.value}
                    variant={selectedQuality === sq.value ? "default" : "outline"}
                    size="sm"
                    className={`text-xs h-8 ${selectedQuality !== sq.value ? sq.color : ""}`}
                    onClick={() => setSelectedQuality(sq.value)}
                  >
                    <Icon className="w-3 h-3 mr-1" />{sq.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <Input type="number" step="0.1" placeholder="Shot time (seconds)" value={shotTime}
              onChange={(e) => setShotTime(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onRecord(shotTime, selectedQuality)} />
            <Button variant="coffee" onClick={() => onRecord(shotTime, selectedQuality)} disabled={loading || !shotTime}>
              {loading ? "..." : "Record"}
            </Button>
          </div>
        </>
      )}

      {state.converged && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-green-700 text-sm font-medium">
            Shot time dialed in — {state.history.filter(h => h.quality === "good").slice(-1)[0]?.time?.toFixed(1)}s
            {" @ "}{state.history.filter(h => h.quality === "good").slice(-1)[0]?.grind}
          </p>
        </div>
      )}
    </div>
  );
}

function GoldenContent({ state, history, onConfigure, onCompare, disabled, loading, needsConfig }: {
  state: GoldenState | null; history: GoldenComparisonEntry[];
  onConfigure: () => void; onCompare: (pref: string) => void; disabled: boolean; loading: boolean; needsConfig: boolean;
}) {
  if (needsConfig) {
    return (
      <div className="text-center space-y-3">
        <p className="text-sm text-muted-foreground">Secant method converged. Configure golden section bounds to continue tuning taste.</p>
        <Button variant="coffeeOutline" onClick={onConfigure} disabled={loading}>{loading ? "Configuring..." : "Continue to Golden Section Search"}</Button>
      </div>
    );
  }
  if (!state) return null;

  const fineGrind = `${state.coarse.macro}${state.coarse.micro}`;
  const coarseGrind = `${state.fine.macro}${state.fine.micro}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div><span className="text-xs text-muted-foreground">Fine</span><p className="font-mono font-bold">{fineGrind}</p></div>
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <div className="flex-1 mx-2 h-2 bg-muted rounded-full relative">
          {state.point_a && state.point_b && (
            <>
              <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-coffee rounded-full border-2 border-white"
                style={{ left: `${((parseInt(state.point_a) - parseInt(fineGrind)) / (parseInt(coarseGrind) - parseInt(fineGrind))) * 100}%` }} title={state.point_a} />
              <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-coffee rounded-full border-2 border-white"
                style={{ left: `${((parseInt(state.point_b) - parseInt(fineGrind)) / (parseInt(coarseGrind) - parseInt(fineGrind))) * 100}%` }} title={state.point_b} />
            </>
          )}
        </div>
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <div><span className="text-xs text-muted-foreground">Coarse</span><p className="font-mono font-bold">{coarseGrind}</p></div>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        Interval: <span className="font-semibold text-coffee">{state.width.toFixed(2)}</span>
        {state.iteration > 0 && <> &mdash; Iteration {state.iteration}</>}
      </div>

      {history.length > 0 && (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted">
              <tr><th className="text-left px-2 py-1.5">#</th><th className="text-left px-2 py-1.5">A</th><th className="text-left px-2 py-1.5">B</th><th className="text-left px-2 py-1.5">Result</th></tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.iteration} className="border-t">
                  <td className="px-2 py-1.5 text-muted-foreground">{h.iteration}</td>
                  <td className="px-2 py-1.5 font-mono">{h.point_a}</td>
                  <td className="px-2 py-1.5 font-mono">{h.point_b}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={h.weight < 0 ? "destructive" : h.weight > 0 ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
                      {h.preference.replace(/_/g, " ")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!disabled && !state.converged && state.point_a && state.point_b && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-coffee/5 border border-coffee/20 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Shot A</p>
              <p className="text-xl font-bold text-coffee">{state.point_a}</p>
              {state.new_point === state.point_a && <Badge variant="outline" className="text-xs mt-1">New</Badge>}
              {state.retained_point === state.point_a && <Badge variant="secondary" className="text-xs mt-1">Retained</Badge>}
            </div>
            <div className="bg-coffee/5 border border-coffee/20 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Shot B</p>
              <p className="text-xl font-bold text-coffee">{state.point_b}</p>
              {state.new_point === state.point_b && <Badge variant="outline" className="text-xs mt-1">New</Badge>}
              {state.retained_point === state.point_b && <Badge variant="secondary" className="text-xs mt-1">Retained</Badge>}
            </div>
          </div>

          <p className="text-center text-sm font-medium">Which tasted better?</p>
          <div className="flex gap-1 justify-center flex-wrap">
            {PREFERENCES.map((p) => (
              <Button key={p.value} variant={p.variant} size="sm" className="text-xs h-8" onClick={() => onCompare(p.value)} disabled={loading}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {state.new_point && !state.converged && !state.point_a && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <p className="text-xs text-blue-600">Pull ONE new shot at</p>
          <p className="text-xl font-bold text-blue-700">{state.new_point}</p>
          {state.retained_point && <p className="text-xs text-blue-500 mt-1">Compare against retained: <span className="font-mono font-bold">{state.retained_point}</span></p>}
        </div>
      )}

      {state.converged && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-green-700 text-sm font-medium">Taste optimized!</p>
          <p className="text-green-600 text-xs mt-1">Best grind: <span className="font-mono font-bold">{state.best_grind || state.retained_point || "—"}</span></p>
        </div>
      )}
    </div>
  );
}

function SaveRecipeContent({ finalGrind, lockedVars, onStartAgain }: {
  finalGrind: string; lockedVars: LockedVars; onStartAgain: () => void;
}) {
  const [recipeName, setRecipeName] = useState("");
  const [dose, setDose] = useState(lockedVars.dose);
  const [syield, setYield] = useState(lockedVars.yield);
  const [temperature, setTemperature] = useState(lockedVars.temperature);
  const [preinfusion, setPreinfusion] = useState(lockedVars.preinfusion);
  const [tasteScore, setTasteScore] = useState("");
  const [tasteComponents, setTasteComponents] = useState<TasteComponents>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleSave = async () => {
    if (!recipeName.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const ts = tasteScore ? parseFloat(tasteScore) : undefined;
      const hasTaste = Object.values(tasteComponents).some(v => v != null);
      await api.recipe.save(recipeName.trim(), {
        dose, yield: syield, temperature, preinfusion,
        taste_score: ts,
        taste_components: hasTaste ? tasteComponents : undefined,
      });
      setSaved(true);
      setSaveError("");
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-coffee/5 border border-coffee/20 rounded-lg p-3 text-center">
        <p className="text-xs text-muted-foreground">Final Grind</p>
        <p className="text-2xl font-bold text-coffee">{finalGrind}</p>
      </div>

      {!saved ? (
        <div className="space-y-3">
          <Input placeholder="Recipe name (e.g., Morning Espresso)" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSave()} />

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Recipe Variables (pre-filled from pipeline)</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Dose (g)</label>
                <Input type="number" step="0.1" value={dose} onChange={(e) => setDose(Number(e.target.value))} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Yield (g)</label>
                <Input type="number" step="0.1" value={syield} onChange={(e) => setYield(Number(e.target.value))} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Temp (°C)</label>
                <Input type="number" step="1" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Preinfusion (s)</label>
                <Input type="number" step="1" value={preinfusion} onChange={(e) => setPreinfusion(Number(e.target.value))} className="h-8 text-xs" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Overall Taste Score (1-10)</label>
            <Input type="number" min={1} max={10} step={0.5} value={tasteScore} onChange={(e) => setTasteScore(e.target.value)} placeholder="8.5" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Taste Breakdown (optional)</label>
            <div className="grid grid-cols-5 gap-1">
              {TASTE_COMPONENTS.map((tc) => (
                <div key={tc.key}>
                  <label className="text-[10px] text-muted-foreground">{tc.label}</label>
                  <Input type="number" min={1} max={10} step={0.5} className="h-7 text-xs px-1" placeholder="—"
                    value={tasteComponents[tc.key] ?? ""}
                    onChange={(e) => setTasteComponents(p => ({ ...p, [tc.key]: e.target.value ? parseFloat(e.target.value) : undefined }))} />
                </div>
              ))}
            </div>
          </div>

          <Button variant="coffee" className="w-full" onClick={handleSave} disabled={saving || !recipeName.trim()}>
            <Save className="w-3.5 h-3.5 mr-1.5" />{saving ? "Saving..." : "Save Recipe"}
          </Button>
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-green-700 text-sm font-medium">Recipe saved!</p>
          <p className="text-green-600 text-xs mt-1">Added as seed for Bayesian optimization.</p>
        </div>
      )}

      <Button variant="outline" className="w-full" onClick={onStartAgain}><RotateCcw className="w-3.5 h-3.5 mr-1.5" />New Coffee Bag</Button>
    </div>
  );
}