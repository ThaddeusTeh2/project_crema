export interface GrindSetting {
  macro: number;
  micro: string;
}

export interface TasteComponents {
  sweetness?: number;
  acidity?: number;
  bitterness?: number;
  body?: number;
  balance?: number;
}

export interface LockedVars {
  dose: number;
  yield: number;
  temperature: number;
  preinfusion: number;
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
  taste_components: TasteComponents | null;
  method: string;
  notes: string | null;
  valid_for_model: boolean;
  valid_reason: string | null;
  shot_quality?: string;
}

export interface SecantHistoryEntry {
  iteration: number;
  grind: string;
  time: number;
  error?: number;
  quality?: string;
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

export interface GoldenComparisonEntry {
  iteration: number;
  point_a: string;
  point_b: string;
  preference: string;
  weight: number;
  action: "pull_new" | "done";
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
  history: GoldenComparisonEntry[];
  best_grind: string | null;
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
  locked_vars: LockedVars | null;
  secant: SecantState | null;
  golden: GoldenState | null;
  recipe: RecipeState | null;
  started_at?: string;
}

export interface Recipe {
  id: string;
  name: string;
  coffee_name: string;
  grind: string | null;
  dose: number | null;
  yield: number | null;
  temperature: number | null;
  preinfusion: number | null;
  target_time: number;
  saved_at: string;
  secant_history: SecantHistoryEntry[];
  golden_converged: boolean;
  source_shot_id: string | null;
}

export interface SecantRecordResponse {
  next_grind: string | null;
  converged: boolean;
  iteration: number;
  error: number;
  final_grind?: string;
  final_time?: number;
  rejected?: boolean;
}

export interface GoldenCompareResponse {
  action: "pull_new" | "done";
  new_point: string | null;
  retained_point: string | null;
  converged: boolean;
  width: number;
  best_grind?: string;
  preference?: string;
  weight?: number;
}

export interface BayesianVariable {
  name: string;
  min: number;
  max: number;
}

export interface EIRationale {
  predicted_score: number;
  uncertainty: number;
  current_best: number;
  expected_improvement: number;
}

export interface BayesianInitResponse {
  first_suggestion: Record<string, unknown>;
  coffee_name: string;
  shot_count: number;
  seed_count: number;
  total_observations: number;
  confidence: string;
}

export interface BayesianRecordResponse {
  recorded: Record<string, number>;
  score: number;
  history_count: number;
  total_observations: number;
  valid_for_model: boolean;
  suggestion?: Record<string, unknown>;
  ei_rationale?: EIRationale | null;
  contour_data?: {
    x: number[];
    y: number[];
    z: number[][];
    z_std: number[][];
    x_label: string;
    y_label: string;
    z_label: string;
    z_std_label: string;
  };
  confidence: string;
  coffee_name: string;
}

export interface BayesianSessionInfo {
  coffee_name: string;
  observations: number;
  total: number;
  initialized: boolean;
}

export interface CoffeeSummary {
  coffee_name: string;
  total_shots: number;
  valid_for_model: number;
}