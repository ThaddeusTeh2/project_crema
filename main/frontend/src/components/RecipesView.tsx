import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Recipe } from "@/types";
import { api } from "@/lib/api";
import { Coffee } from "lucide-react";

export function RecipesView() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  useEffect(() => {
    api.recipe.list().then(setRecipes).catch(console.error);
  }, []);

  if (recipes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saved Recipes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No recipes saved yet. Complete a pipeline to save your first recipe.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved Recipes ({recipes.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {recipes.map((recipe, i) => (
          <div key={i} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coffee className="w-4 h-4 text-coffee" />
                <h3 className="font-semibold">{recipe.name}</h3>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(recipe.saved_at).toLocaleDateString()}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-coffee/5 rounded-md p-2 text-center">
                <p className="text-xs text-muted-foreground">Coffee</p>
                <p className="font-medium">{recipe.coffee_name}</p>
              </div>
              <div className="bg-coffee/5 rounded-md p-2 text-center">
                <p className="text-xs text-muted-foreground">Grind</p>
                <p className="font-mono font-bold text-coffee text-lg">{recipe.grind || "—"}</p>
              </div>
              <div className="bg-coffee/5 rounded-md p-2 text-center">
                <p className="text-xs text-muted-foreground">Target</p>
                <p className="font-medium">{recipe.target_time}s</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={recipe.golden_converged ? "success" : "secondary"} className="text-xs">
                {recipe.golden_converged ? "Golden Optimized" : "Secant Only"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {recipe.secant_history.length} secant shots
              </span>
            </div>

            {recipe.secant_history.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Shot history ({recipe.secant_history.length})
                </summary>
                <div className="mt-2 border rounded overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left px-2 py-1">#</th>
                        <th className="text-left px-2 py-1">Grind</th>
                        <th className="text-left px-2 py-1">Time</th>
                        <th className="text-left px-2 py-1">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipe.secant_history.map((h) => (
                        <tr key={h.iteration} className="border-t">
                          <td className="px-2 py-1">{h.iteration}</td>
                          <td className="px-2 py-1 font-mono">{h.grind}</td>
                          <td className="px-2 py-1">{h.time}s</td>
                          <td className="px-2 py-1">
                            {h.error != null ? `${h.error > 0 ? "+" : ""}${h.error.toFixed(1)}s` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}