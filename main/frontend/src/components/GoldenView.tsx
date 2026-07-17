import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, ArrowRight } from "lucide-react";
import type { GoldenState, GoldenCompareResponse } from "@/types";
import { api } from "@/lib/api";

interface GoldenViewProps {
  state: GoldenState;
  onStateUpdate: (state: GoldenState) => void;
  onConverged: (bestGrind: string) => void;
}

export function GoldenView({ state, onStateUpdate, onConverged }: GoldenViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCompare = async (winner: "a" | "b") => {
    setLoading(true);
    setError("");
    try {
      const result: GoldenCompareResponse = await api.golden.compare(winner);
      const newState: GoldenState = {
        ...state,
        converged: result.converged,
        point_a: result.action === "pull_new" ? state.point_a : null,
        point_b: result.action === "pull_new" ? state.point_b : null,
        retained_point: result.retained_point,
        new_point: result.new_point,
        width: result.width,
        iteration: state.iteration + 1,
      };
      onStateUpdate(newState);

      if (result.converged) {
        onConverged(result.best_grind || result.retained_point || "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to compare");
    } finally {
      setLoading(false);
    }
  };

  const coarseGrind = `${state.coarse.macro}${state.coarse.micro}`;
  const fineGrind = `${state.fine.macro}${state.fine.micro}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Golden Section Search</span>
          {state.converged ? (
            <Badge variant="success">Optimized</Badge>
          ) : (
            <Badge variant="secondary">Tuning Taste</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Compare pairs of shots to find the grind that tastes best. Only one new shot per iteration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <div>
            <span className="text-muted-foreground">Fine</span>
            <p className="font-mono font-bold">{fineGrind}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div className="flex-1 mx-4 h-2 bg-muted rounded-full relative">
            {state.point_a && state.point_b && (
              <>
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-coffee rounded-full border-2 border-white"
                  style={{
                    left: `${((parseInt(state.point_a) - parseInt(fineGrind)) / (parseInt(coarseGrind) - parseInt(fineGrind))) * 100}%`,
                  }}
                  title={state.point_a}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-coffee rounded-full border-2 border-white"
                  style={{
                    left: `${((parseInt(state.point_b) - parseInt(fineGrind)) / (parseInt(coarseGrind) - parseInt(fineGrind))) * 100}%`,
                  }}
                  title={state.point_b}
                />
              </>
            )}
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div>
            <span className="text-muted-foreground">Coarse</span>
            <p className="font-mono font-bold">{coarseGrind}</p>
          </div>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          Interval width: <span className="font-semibold text-coffee">{state.width.toFixed(2)}</span>
        </div>

        {!state.converged && state.point_a && state.point_b && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
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
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleCompare("a")}
                disabled={loading}
              >
                <ThumbsUp className="w-4 h-4 mr-2" /> A Better
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleCompare("b")}
                disabled={loading}
              >
                <ThumbsDown className="w-4 h-4 mr-2" /> B Better
              </Button>
            </div>
          </div>
        )}

        {state.new_point && !state.converged && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-sm text-blue-600">Pull ONE shot at</p>
            <p className="text-2xl font-bold text-blue-700">{state.new_point}</p>
            {state.retained_point && (
              <p className="text-xs text-blue-500 mt-1">
                Compare against retained point: {state.retained_point}
              </p>
            )}
          </div>
        )}

        {state.converged && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-green-700 font-medium">Taste optimized!</p>
            <p className="text-green-600 text-sm mt-1">
              Best grind: {state.point_a || state.retained_point || "—"}
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </CardContent>
    </Card>
  );
}