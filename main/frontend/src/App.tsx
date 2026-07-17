import { useState } from "react";
import { PipelineView } from "@/components/PipelineView";
import { BayesianView } from "@/components/BayesianView";
import { ShotLog } from "@/components/ShotLog";
import { Button } from "@/components/ui/button";
import { Coffee } from "lucide-react";

type Tab = "pipeline" | "advanced" | "log";

export default function App() {
  const [tab, setTab] = useState<Tab>("pipeline");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
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

      <main className="max-w-3xl mx-auto px-4 py-6">
        {tab === "pipeline" && <PipelineView />}
        {tab === "advanced" && <BayesianView />}
        {tab === "log" && <ShotLog />}
      </main>
    </div>
  );
}