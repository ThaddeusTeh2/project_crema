import { cn } from "@/lib/utils";
import { Check, Circle, Lock } from "lucide-react";
import type { PipelinePhase, SecantState, GoldenState, RecipeState } from "@/types";

interface PipelineStepperProps {
  phase: PipelinePhase;
  secant: SecantState | null;
  golden: GoldenState | null;
  recipe: RecipeState | null;
}

const steps: { key: PipelinePhase; label: string; desc: string }[] = [
  { key: "setup", label: "Setup", desc: "Coffee & starting grind" },
  { key: "secant", label: "Secant Method", desc: "Dial in shot time" },
  { key: "golden", label: "Golden Section", desc: "Maximize taste" },
  { key: "recipe", label: "Save Recipe", desc: "Save your recipe" },
];

function getStatus(
  phase: PipelinePhase,
  stepKey: PipelinePhase,
  secant: SecantState | null,
  golden: GoldenState | null,
  recipe: RecipeState | null
): "done" | "active" | "locked" {
  const order: PipelinePhase[] = ["setup", "secant", "golden", "recipe"];
  const currentIdx = order.indexOf(phase);
  const stepIdx = order.indexOf(stepKey);

  if (stepIdx < currentIdx) return "done";
  if (stepIdx === currentIdx) return "active";

  if (stepKey === "golden" && secant?.converged) return "active";
  if (stepKey === "recipe" && golden?.converged) return "active";
  if (stepKey === "recipe" && secant?.converged && !golden?.active) {
    return "active";
  }

  return "locked";
}

export function PipelineStepper({ phase, secant, golden, recipe }: PipelineStepperProps) {
  return (
    <div className="flex flex-col space-y-1">
      {steps.map((step, i) => {
        const status = getStatus(phase, step.key, secant, golden, recipe);
        const isLast = i === steps.length - 1;

        return (
          <div key={step.key} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              {status === "done" ? (
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
              ) : status === "active" ? (
                <div className="w-6 h-6 rounded-full bg-coffee flex items-center justify-center">
                  <Circle className="w-3 h-3 text-white fill-white" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
                  <Lock className="w-3 h-3 text-muted-foreground/40" />
                </div>
              )}
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 h-6",
                    status === "done" ? "bg-green-500" : "bg-muted"
                  )}
                />
              )}
            </div>
            <div className="pb-4">
              <p
                className={cn(
                  "text-sm font-medium",
                  status === "active" && "text-coffee",
                  status === "locked" && "text-muted-foreground/50"
                )}
              >
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground">{step.desc}</p>
              {step.key === "secant" && secant?.converged && (
                <p className="text-xs text-green-600 mt-0.5">
                  Converged — {secant.history[secant.history.length - 1]?.grind} at{" "}
                  {secant.history[secant.history.length - 1]?.time}s
                </p>
              )}
              {step.key === "golden" && golden?.converged && (
                <p className="text-xs text-green-600 mt-0.5">
                  Best grind: {golden.point_a || golden.retained_point}
                </p>
              )}
              {step.key === "recipe" && recipe?.saved && (
                <p className="text-xs text-green-600 mt-0.5">
                  {recipe.recipe_name}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}