import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import type { Shot } from "@/types";
import { api } from "@/lib/api";

const METHOD_LABELS: Record<string, string> = {
  secant: "Secant",
  secant_start: "Secant Start",
  golden_test: "Golden Test",
  golden_compare: "Golden",
  bayesian: "Bayesian",
  manual: "Manual",
};

export function ShotLog() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [filter, setFilter] = useState("");

  const loadShots = () => {
    api.shots.list().then(setShots).catch(console.error);
  };

  useEffect(() => {
    loadShots();
  }, []);

  const handleClear = async () => {
    try {
      await api.shots.clear();
      setShots([]);
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = filter ? shots.filter((s) => s.method === filter) : shots;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Shot Log</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-normal text-muted-foreground">
              {shots.length} shots
            </span>
            {shots.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="text-red-500 hover:text-red-700">
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant={filter === "" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setFilter("")}
          >
            All
          </Badge>
          {["secant", "golden_test", "golden_compare", "bayesian", "manual"].map((m) => (
            <Badge
              key={m}
              variant={filter === m ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setFilter(m)}
            >
              {METHOD_LABELS[m] || m}
            </Badge>
          ))}
        </div>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Coffee</th>
                <th className="text-left px-3 py-2">Grind</th>
                <th className="text-left px-3 py-2">Time</th>
                <th className="text-left px-3 py-2">Score</th>
                <th className="text-left px-3 py-2">Method</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No shots logged yet. Start a pipeline to begin.
                  </td>
                </tr>
              ) : (
                filtered.map((shot) => (
                  <tr key={shot.id} className="border-t hover:bg-muted/50">
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(shot.timestamp).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 max-w-[120px] truncate">
                      {shot.coffee_name}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {shot.grind_macro}{shot.grind_micro}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {shot.shot_time ? `${shot.shot_time}s` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {shot.taste_score ? (
                        <span className="font-semibold text-coffee">{shot.taste_score}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs">
                        {METHOD_LABELS[shot.method] || shot.method}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}