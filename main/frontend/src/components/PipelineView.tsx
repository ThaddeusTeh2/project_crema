import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GrindInput } from "@/components/GrindInput";
import { GrinderDisclaimer } from "@/components/GrinderDisclaimer";
import { ThumbsUp, ThumbsDown, ArrowRight, Coffee, RotateCcw, Undo2, Save, CheckCircle2, CircleDashed } from "lucide-react";
import type { PipelineState, PipelinePhase, SecantState, GoldenState, SecantRecordResponse, GoldenCompareResponse } from "@/types";
import { api } from "@/lib/api";

export function PipelineView() {
  const [phase, setPhase] = useState<PipelinePhase>("setup");
  const [coffeeName, setCoffeeName] = useState("");
  const [targetTime, setTargetTime] = useState(30);
  const [secant, setSecant] = useState<SecantState | null>(null);
  const [golden, setGolden] = useState<GoldenState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reloadState = useCallback(async () => {
    try {
      const state: PipelineState = await api.pipeline.state();
      if (state && state.phase !== "setup") {
        setPhase(state.phase);
        setCoffeeName(state.coffee_name);
        setTargetTime(state.target_time);
        setSecant(state.secant);
        setGolden(state.golden);
      }
    } catch {
      // No active pipeline
    }
  }, []);

  useEffect(() => {
    reloadState();
  }, [reloadState]);

  const handleStart = async (name: string, macro: number, micro: string, target: number) => {
    setLoading(true);
    setError("");
    try {
      const state = await api.pipeline.start({
        coffee_name: name,
        macro,
        micro,
        target_time: target,
      });
      setPhase("secant");
      setCoffeeName(name);
      setTargetTime(target);
      setSecant(state.secant);
      setGolden(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setLoading(false);
    }
  };

  const handleSecantRecord = async (shotTime: string) => {
    const t = parseFloat(shotTime);
    if (isNaN(t) || t <= 0 || !secant) return;

    setLoading(true);
    setError("");
    try {
      const result: SecantRecordResponse = await api.secant.record(t);
      const newState: SecantState = {
        ...secant,
        converged: result.converged,
        next_grind: result.next_grind,
        iteration: result.iteration,
        error: result.error,
        history: [
          ...secant.history,
          {
            iteration: result.iteration,
            grind: secant.next_grind || "?",
            time: t,
            error: t - targetTime,
          },
        ],
      };
      setSecant(newState);
      if (result.converged) {
        setPhase("golden");
      }
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
      setGolden(fullState.golden);
      setPhase("golden");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start golden section");
    } finally {
      setLoading(false);
    }
  };

  const handleGoldenCompare = async (winner: "a" | "b") => {
    if (!golden) return;
    setLoading(true);
    setError("");
    try {
      const result: GoldenCompareResponse = await api.golden.compare(winner);
      const newState: GoldenState = {
        ...golden,
        converged: result.converged,
        point_a: result.action === "pull_new" ? golden.point_a : null,
        point_b: result.action === "pull_new" ? golden.point_b : null,
        retained_point: result.retained_point,
        new_point: result.new_point,
        width: result.width,
        iteration: golden.iteration + 1,
      };
      setGolden(newState);
      if (result.converged) {
        setPhase("recipe");
      }
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
      setPhase("setup");
      setCoffeeName("");
      setTargetTime(30);
      setSecant(null);
      setGolden(null);
      setError("");
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  const handleRestartPhase = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.pipeline.restartPhase();
      setPhase(result.phase as PipelinePhase);
      setSecant(result.state.secant);
      setGolden(result.state.golden);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to restart phase");
    } finally {
      setLoading(false);
    }
  };

  const getFinalGrind = (): string => {
    if (golden?.converged && secant?.converged) {
      return golden.point_a || golden.retained_point || "—";
    }
    if (secant?.converged && secant.history.length > 0) {
      return secant.history[secant.history.length - 1].grind;
    }
    return "—";
  };

  const isSetupDone = phase !== "setup";
  const showSecant = phase !== "setup";
  const isSecantDone = phase === "golden" || phase === "recipe";
  const showGolden = isSecantDone || (secant?.converged ?? false);
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
                <Undo2 className="w-3.5 h-3.5 mr-1" />
                Restart This Step
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleStartAgain} disabled={loading}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Start Again
            </Button>
          </div>
        </div>
      )}

      {/* Setup */}
      <PhaseSection
        title="New Coffee"
        description="Enter your coffee name and estimate a starting grind to begin the dial-in process."
        done={isSetupDone}
        active={phase === "setup"}
      >
        {phase === "setup" ? (
          <SetupContent onStart={handleStart} />
        ) : (
          <SetupSummary coffeeName={coffeeName} targetTime={targetTime} onRestart={handleStartAgain} />
        )}
      </PhaseSection>

      {/* Secant */}
      {showSecant && (
        <PhaseSection
          title="Secant Method"
          description={`Dial in shot time by linear interpolation. Target: ${targetTime}s.`}
          done={isSecantDone}
          active={phase === "secant"}
          doneLabel={secant?.converged ? `Converged — ${secant.history[secant.history.length - 1]?.time}s @ ${secant.history[secant.history.length - 1]?.grind}` : undefined}
        >
          <SecantContent
            state={secant}
            targetTime={targetTime}
            onRecord={handleSecantRecord}
            disabled={isSecantDone}
            loading={loading}
          />
        </PhaseSection>
      )}

      {/* Golden */}
      {showGolden && (
        <PhaseSection
          title="Golden Section Search"
          description="Compare pairs of shots to find the grind that tastes best."
          done={isGoldenDone}
          active={phase === "golden"}
          doneLabel={golden?.converged ? `Optimized — Best: ${golden.point_a || golden.retained_point || "—"}` : undefined}
        >
          <GoldenContent
            state={golden}
            onConfigure={handleGoldenConfigure}
            onCompare={handleGoldenCompare}
            disabled={isGoldenDone}
            loading={loading}
            needsConfig={phase === "golden" && !golden}
          />
        </PhaseSection>
      )}

      {/* Save Recipe */}
      {showRecipe && (
        <PhaseSection
          title="Save Recipe"
          description="Your recipe is ready. Save it with a name to reference later."
          done={false}
          active={phase === "recipe"}
        >
          <SaveRecipeContent finalGrind={getFinalGrind()} onStartAgain={handleStartAgain} />
        </PhaseSection>
      )}

      <GrinderDisclaimer />
    </div>
  );
}

function PhaseSection({
  title,
  description,
  done,
  active,
  doneLabel,
  children,
}: {
  title: string;
  description: string;
  done: boolean;
  active: boolean;
  doneLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={done ? "opacity-60" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            {done ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : active ? (
              <CircleDashed className="w-4 h-4 text-coffee animate-pulse" />
            ) : (
              <CircleDashed className="w-4 h-4 text-muted-foreground" />
            )}
            {title}
          </span>
          {done && doneLabel && (
            <Badge variant="success" className="text-xs">{doneLabel}</Badge>
          )}
          {!done && active && (
            <Badge variant="secondary" className="text-xs">Active</Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SetupContent({ onStart }: { onStart: (name: string, macro: number, micro: string, target: number) => void }) {
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
      <Button variant="coffee" className="w-full" disabled={!name.trim()} onClick={() => onStart(name.trim(), macro, micro, target)}>
        Start Dialing In
      </Button>
    </div>
  );
}

function SetupSummary({ coffeeName, targetTime, onRestart }: { coffeeName: string; targetTime: number; onRestart: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <p className="text-sm">{coffeeName}</p>
        <p className="text-xs text-muted-foreground">Target: {targetTime}s</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRestart}>
        <RotateCcw className="w-3.5 h-3.5 mr-1" />
        Start Over
      </Button>
    </div>
  );
}

function SecantContent({
  state,
  targetTime,
  onRecord,
  disabled,
  loading,
}: {
  state: SecantState | null;
  targetTime: number;
  onRecord: (time: string) => void;
  disabled: boolean;
  loading: boolean;
}) {
  const [shotTime, setShotTime] = useState("");

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
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.1"
              placeholder="Shot time (seconds)"
              value={shotTime}
              onChange={(e) => setShotTime(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onRecord(shotTime)}
            />
            <Button variant="coffee" onClick={() => onRecord(shotTime)} disabled={loading || !shotTime}>
              {loading ? "..." : "Record"}
            </Button>
          </div>
        </>
      )}

      {state.converged && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-green-700 text-sm font-medium">
            Shot time dialed in — {state.history[state.history.length - 1]?.time?.toFixed(1)}s
            {" @ "}{state.history[state.history.length - 1]?.grind}
          </p>
        </div>
      )}
    </div>
  );
}

function GoldenContent({
  state,
  onConfigure,
  onCompare,
  disabled,
  loading,
  needsConfig,
}: {
  state: GoldenState | null;
  onConfigure: () => void;
  onCompare: (winner: "a" | "b") => void;
  disabled: boolean;
  loading: boolean;
  needsConfig: boolean;
}) {
  if (needsConfig) {
    return (
      <div className="text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Secant method converged. Configure golden section bounds to continue.
        </p>
        <Button variant="coffeeOutline" onClick={onConfigure} disabled={loading}>
          {loading ? "Configuring..." : "Continue to Golden Section Search"}
        </Button>
      </div>
    );
  }

  if (!state) return null;

  const fineGrind = `${state.coarse.macro}${state.coarse.micro}`;
  const coarseGrind = `${state.fine.macro}${state.fine.micro}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="text-xs text-muted-foreground">Fine</span>
          <p className="font-mono font-bold">{fineGrind}</p>
        </div>
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <div className="flex-1 mx-2 h-2 bg-muted rounded-full relative">
          {state.point_a && state.point_b && (
            <>
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-coffee rounded-full border-2 border-white"
                style={{
                  left: `${((parseInt(state.point_a) - parseInt(fineGrind)) / (parseInt(coarseGrind) - parseInt(fineGrind))) * 100}%`,
                }}
                title={state.point_a}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-coffee rounded-full border-2 border-white"
                style={{
                  left: `${((parseInt(state.point_b) - parseInt(fineGrind)) / (parseInt(coarseGrind) - parseInt(fineGrind))) * 100}%`,
                }}
                title={state.point_b}
              />
            </>
          )}
        </div>
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <div>
          <span className="text-xs text-muted-foreground">Coarse</span>
          <p className="font-mono font-bold">{coarseGrind}</p>
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        Interval width: <span className="font-semibold text-coffee">{state.width.toFixed(2)}</span>
      </div>

      {!disabled && !state.converged && state.point_a && state.point_b && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-coffee/5 border border-coffee/20 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Shot A</p>
              <p className="text-xl font-bold text-coffee">{state.point_a}</p>
            </div>
            <div className="bg-coffee/5 border border-coffee/20 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Shot B</p>
              <p className="text-xl font-bold text-coffee">{state.point_b}</p>
            </div>
          </div>

          <p className="text-center text-sm font-medium">Which tasted better?</p>

          <div className="flex gap-2 justify-center">
            <Button variant="outline" className="flex-1" onClick={() => onCompare("a")} disabled={loading}>
              <ThumbsUp className="w-3.5 h-3.5 mr-1.5" /> A Better
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => onCompare("b")} disabled={loading}>
              <ThumbsDown className="w-3.5 h-3.5 mr-1.5" /> B Better
            </Button>
          </div>
        </div>
      )}

      {state.new_point && !state.converged && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <p className="text-xs text-blue-600">Pull ONE shot at</p>
          <p className="text-xl font-bold text-blue-700">{state.new_point}</p>
          {state.retained_point && (
            <p className="text-xs text-blue-500 mt-1">Compare against: {state.retained_point}</p>
          )}
        </div>
      )}

      {state.converged && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-green-700 text-sm font-medium">Taste optimized!</p>
          <p className="text-green-600 text-xs mt-1">Best grind: {state.point_a || state.retained_point || "—"}</p>
        </div>
      )}
    </div>
  );
}

function SaveRecipeContent({ finalGrind, onStartAgain }: { finalGrind: string; onStartAgain: () => void }) {
  const [recipeName, setRecipeName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!recipeName.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api.recipe.save(recipeName.trim());
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
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
        <div className="space-y-2">
          <Input
            placeholder="Recipe name (e.g., Morning Espresso)"
            value={recipeName}
            onChange={(e) => setRecipeName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <div className="flex gap-2">
            <Button variant="coffee" className="flex-1" onClick={handleSave} disabled={saving || !recipeName.trim()}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saving ? "Saving..." : "Save Recipe"}
            </Button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-green-700 text-sm font-medium">Recipe saved: {recipeName}</p>
        </div>
      )}

      <Button variant="outline" className="w-full" onClick={onStartAgain}>
        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
        New Coffee Bag
      </Button>
    </div>
  );
}