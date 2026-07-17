import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Coffee, RefreshCcw, Save } from "lucide-react";
import { api } from "@/lib/api";

interface SaveRecipeViewProps {
  finalGrind: string;
  onSaved: () => void;
  onNewBag: () => void;
}

export function SaveRecipeView({ finalGrind, onSaved, onNewBag }: SaveRecipeViewProps) {
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
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Save Recipe</CardTitle>
        <CardDescription>
          Your recipe is ready. Save it with a name to reference later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-coffee/5 border border-coffee/20 rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">Final Grind</p>
          <p className="text-3xl font-bold text-coffee">{finalGrind}</p>
        </div>

        {!saved ? (
          <div className="space-y-3">
            <Input
              placeholder="Recipe name (e.g., Morning Espresso)"
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
            <div className="flex gap-2">
              <Button
                variant="coffee"
                className="flex-1"
                onClick={handleSave}
                disabled={saving || !recipeName.trim()}
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save Recipe"}
              </Button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-green-700 font-medium">Recipe saved: {recipeName}</p>
            </div>
          </div>
        )}

        <div className="pt-2">
          <Button variant="outline" className="w-full" onClick={onNewBag}>
            <RefreshCcw className="w-4 h-4 mr-2" />
            New Coffee Bag
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}