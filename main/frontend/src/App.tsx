import { useState, useEffect, useCallback } from "react";
import { PipelineStepper } from "@/components/PipelineStepper";
import { SetupView } from "@/components/SetupView";
import { SecantView } from "@/components/SecantView";
import { GoldenView } from "@/components/GoldenView";
import { SaveRecipeView } from "@/components/SaveRecipeView";
import { BayesianView } from "@/components/BayesianView";
import { ShotLog } from "@/components/ShotLog";
import { GrinderDisclaimer } from "@/components/GrinderDisclaimer";
import { Button } from "@/components/ui/button";
import type { PipelineState, PipelinePhase, SecantState, GoldenState, RecipeState } from "@/types";
import { api } from "@/lib/api";
import { Coffee } from "lucide-react";

type Tab = "pipeline" | "advanced" | "log";

export default function App() {
  const [tab, setTab] = useState<Tab>("pipeline");
  const [phase, setPhase] = useState<PipelinePhase>("setup");
  const [coffeeName, setCoffeeName] = useState("");
  const [targetTime, setTargetTime] = useState(30);
  const [secant, setSecant] = useState<SecantState | null>(null);
  const [golden, setGolden] = useState<GoldenState | null>(null);
  const [recipe, setRecipe] = useState<RecipeState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const state: PipelineState = await api.pipeline.state();
      if (state && state.phase !== "setup") {
        setPhase(state.phase);
        setCoffeeName(state.coffee_name);
        setTargetTime(state.target_time);
        setSecant(state.secant);
        setGolden(state.golden);
        setRecipe(state.recipe);
      }
    } catch (e) {
      // No active pipeline
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleStart = async (
    name: string,
    macro: number,
    micro: string,
    target: number
  ) => {
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
      setRecipe(null);
      setTab("pipeline");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setLoading(false);
    }
  };

  const handleSecantUpdate = (s: SecantState) => {
    setSecant(s);
  };

  const handleSecantConverged = () => {
    setPhase("golden");
  };

  const handleGoldenConfig = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.golden.config();
      const fullState = await api.pipeline.state();
      setGolden(fullState.golden);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start golden section");
    } finally {
      setLoading(false);
    }
  };

  const handleGoldenUpdate = (g: GoldenState) => {
    setGolden(g);
  };

  const handleGoldenConverged = (_bestGrind: string) => {
    setPhase("recipe");
  };

  const handleRecipeSaved = () => {
    // Recipe saved successfully
  };

  const handleNewBag = async () => {
    setLoading(true);
    try {
      await api.pipeline.reset();
      setPhase("setup");
      setCoffeeName("");
      setTargetTime(30);
      setSecant(null);
      setGolden(null);
      setRecipe(null);
      setError("");
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  const getFinalGrind = (): string => {
    if (golden?.converged) {
      return golden.point_a || golden.retained_point || "—";
    }
    if (secant?.converged && secant.history.length > 0) {
      return secant.history[secant.history.length - 1].grind;
    }
    return "—";
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coffee className="w-6 h-6 text-coffee" />
            <h1 className="text-xl font-bold text-coffee">Crema</h1>
          </div>
          <nav className="flex gap-1">
            {(["pipeline", "advanced", "log"] as const).map((t) => (
              <Button
                key={t}
                variant={tab === t ? "coffee" : "ghost"}
                size="sm"
                onClick={() => setTab(t)}
              >
                {t === "pipeline" ? "Pipeline" : t === "advanced" ? "Advanced" : "Log"}
              </Button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
            <button
              className="ml-2 underline"
              onClick={() => setError("")}
            >
              Dismiss
            </button>
          </div>
        )}

        {tab === "pipeline" && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <aside className="md:col-span-1">
              <div className="bg-card border rounded-lg p-4">
                <PipelineStepper
                  phase={phase}
                  secant={secant}
                  golden={golden}
                  recipe={recipe}
                />
              </div>
            </aside>

            <div className="md:col-span-3 space-y-6">
              {coffeeName && phase !== "setup" && (
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">{coffeeName}</h2>
                  <span className="text-sm text-muted-foreground">
                    Target: {targetTime}s
                  </span>
                </div>
              )}

              {phase === "setup" && (
                <SetupView onStart={handleStart} />
              )}

              {phase === "secant" && secant && (
                <SecantView
                  state={secant}
                  targetTime={targetTime}
                  onStateUpdate={handleSecantUpdate}
                  onConverged={handleSecantConverged}
                />
              )}

              {secant?.converged && phase === "secant" && (
                <div className="text-center">
                  <Button variant="coffeeOutline" onClick={handleGoldenConfig}>
                    Continue to Golden Section Search
                  </Button>
                </div>
              )}

              {phase === "golden" && golden && (
                <GoldenView
                  state={golden}
                  onStateUpdate={handleGoldenUpdate}
                  onConverged={handleGoldenConverged}
                />
              )}

              {golden?.converged && phase === "golden" && (
                <div className="text-center">
                  <Button variant="coffeeOutline" onClick={() => setPhase("recipe")}>
                    Save Recipe
                  </Button>
                </div>
              )}

              {phase === "recipe" && (
                <SaveRecipeView
                  finalGrind={getFinalGrind()}
                  onSaved={handleRecipeSaved}
                  onNewBag={handleNewBag}
                />
              )}

              <GrinderDisclaimer />
            </div>
          </div>
        )}

        {tab === "advanced" && <BayesianView />}

        {tab === "log" && <ShotLog />}
      </main>
    </div>
  );
}