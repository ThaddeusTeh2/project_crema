export interface GrindSetting {
  macro: number;
  micro: string;
}

export interface Shot {
  id: string;
  coffee_name: string;
  timestamp: string;
  grind_macro: number;
  grind_micro: string;
  dose: number | null;
  yield: number | null;
  temperature: number | null;
  preinfusion: number | null;
  shot_time: number | null;
  taste_score: number | null;
  method: string;
  notes: string | null;
}

export interface SecantHistoryEntry {
  iteration: number;
  grind: string;
  time: number;
  error?: number;
}

export interface SecantState {
  active: boolean;
  converged: boolean;
  history: SecantHistoryEntry[];
  next_grind: string | null;
  iteration: number;
  error: number | null;
  target_time: number;
}

export interface GoldenState {
  active: boolean;
  converged: boolean;
  coarse: GrindSetting;
  fine: GrindSetting;
  point_a: string | null;
  point_b: string | null;
  retained_point: string | null;
  new_point: string | null;
  width: number;
  iteration: number;
}

export interface RecipeState {
  saved: boolean;
  recipe_name: string | null;
  final_grind: string | null;
}

export type PipelinePhase = "setup" | "secant" | "golden" | "recipe";

export interface PipelineState {
  phase: PipelinePhase;
  coffee_name: string;
  target_time: number;
  starting_grind: GrindSetting | null;
  secant: SecantState | null;
  golden: GoldenState | null;
  recipe: RecipeState | null;
  started_at?: string;
}

export interface Recipe {
  name: string;
  coffee_name: string;
  grind: string | null;
  target_time: number;
  saved_at: string;
  secant_history: SecantHistoryEntry[];
  golden_converged: boolean;
}

export interface SecantRecordResponse {
  next_grind: string | null;
  converged: boolean;
  iteration: number;
  error: number;
  final_grind?: string;
  final_time?: number;
}

export interface GoldenCompareResponse {
  action: "pull_new" | "done";
  new_point: string | null;
  retained_point: string | null;
  converged: boolean;
  width: number;
  best_grind?: string;
}

export interface BayesianVariable {
  name: string;
  min: number;
  max: number;
}

export interface BayesianInitResponse {
  first_suggestion: Record<string, unknown>;
}

export interface BayesianRecordResponse {
  recorded: Record<string, number>;
  score: number;
  iteration: number;
  suggestion: Record<string, unknown>;
  contour_data: {
    x: number[];
    y: number[];
    z: number[][];
    x_label: string;
    y_label: string;
    z_label: string;
  };
}