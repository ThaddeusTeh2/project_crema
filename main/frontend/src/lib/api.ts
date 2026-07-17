import type {
  PipelineState,
  SecantRecordResponse,
  GoldenCompareResponse,
  Shot,
  Recipe,
  BayesianInitResponse,
  BayesianRecordResponse,
  BayesianSessionInfo,
  CoffeeSummary,
  TasteComponents,
} from "@/types";

const BASE = "/api";

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

async function del<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export const api = {
  pipeline: {
    start: (data: {
      coffee_name: string;
      macro: number;
      micro: string;
      target_time: number;
      dose?: number;
      yield?: number;
      temperature?: number;
      preinfusion?: number;
    }) => post<PipelineState>("/pipeline/start", data),
    state: () => get<PipelineState>("/pipeline/state"),
    reset: () => post<{ ok: boolean }>("/pipeline/reset"),
    restartPhase: () => post<{ ok: boolean; phase: string; state: PipelineState }>("/pipeline/restart-phase"),
  },
  secant: {
    record: (shot_time: number, extra?: { shot_quality?: string; notes?: string }) =>
      post<SecantRecordResponse>("/pipeline/secant/record", {
        shot_time,
        shot_quality: extra?.shot_quality || "good",
        notes: extra?.notes,
      }),
  },
  golden: {
    config: (bounds?: {
      coarse_macro: number;
      fine_macro: number;
      coarse_micro: string;
      fine_micro: string;
    }) =>
      post<{ point_a: string; point_b: string }>(
        "/pipeline/golden/config",
        bounds || {}
      ),
    compare: (preference: string) =>
      post<GoldenCompareResponse>("/pipeline/golden/compare", { preference }),
  },
  recipe: {
    save: (recipe_name: string, extra?: {
      dose?: number;
      yield?: number;
      temperature?: number;
      preinfusion?: number;
      taste_score?: number;
      taste_components?: TasteComponents;
    }) =>
      post<{ recipe: Recipe; seed_shot_id: string }>("/pipeline/recipe/save", {
        recipe_name,
        ...extra,
      }),
    list: () => get<Recipe[]>("/recipes"),
    delete: (id: string) => del<{ ok: boolean }>(`/recipes/${id}`),
  },
  bayesian: {
    init: (coffee_name: string, n_initial?: number) =>
      post<BayesianInitResponse>("/bayesian/init", { coffee_name, n_initial }),
    suggest: (coffee_name: string) =>
      post<{ suggestion: Record<string, unknown>; coffee_name: string }>(
        "/bayesian/suggest",
        { coffee_name }
      ),
    record: (coffee_name: string, params: Record<string, number>, score: number, extra?: {
      shot_time?: number;
      notes?: string;
      valid_for_model?: boolean;
      valid_reason?: string;
      taste_components?: TasteComponents;
    }) =>
      post<BayesianRecordResponse>("/bayesian/record", {
        coffee_name,
        params,
        score,
        ...extra,
      }),
    state: (coffee_name: string) =>
      get<{
        coffee_name: string;
        initialized: boolean;
        history: Record<string, unknown>[];
        history_count: number;
        total_observations: number;
        confidence: string;
        variables: { name: string; min: number; max: number }[];
      }>(`/bayesian/state?coffee_name=${encodeURIComponent(coffee_name)}`),
    sessions: () => get<BayesianSessionInfo[]>("/bayesian/sessions"),
    reset: (coffee_name: string) =>
      post<{ ok: boolean }>("/bayesian/reset", { coffee_name }),
    coffees: () => get<CoffeeSummary[]>("/bayesian/coffees"),
  },
  shots: {
    list: (method?: string, coffee?: string) => {
      const params = new URLSearchParams();
      if (method) params.set("method", method);
      if (coffee) params.set("coffee", coffee);
      const qs = params.toString();
      return get<Shot[]>(`/shots${qs ? `?${qs}` : ""}`);
    },
    add: (shot: Partial<Shot>) => post<Shot>("/shots", shot),
    clear: () => del<{ ok: boolean }>("/shots"),
    exportJson: () => fetch(`${BASE}/shots/export`),
  },
  resetAll: () => post<{ ok: boolean }>("/reset-all"),
};