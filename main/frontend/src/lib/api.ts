import type {
  PipelineState,
  SecantRecordResponse,
  GoldenCompareResponse,
  Shot,
  Recipe,
  BayesianInitResponse,
  BayesianRecordResponse,
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

export const api = {
  pipeline: {
    start: (data: {
      coffee_name: string;
      macro: number;
      micro: string;
      target_time: number;
    }) => post<PipelineState>("/pipeline/start", data),
    state: () => get<PipelineState>("/pipeline/state"),
    reset: () => post<{ ok: boolean }>("/pipeline/reset"),
  },
  secant: {
    record: (shot_time: number) =>
      post<SecantRecordResponse>("/pipeline/secant/record", { shot_time }),
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
    compare: (winner: "a" | "b") =>
      post<GoldenCompareResponse>("/pipeline/golden/compare", { winner }),
  },
  recipe: {
    save: (recipe_name: string) =>
      post<{ recipe: Recipe }>("/pipeline/recipe/save", { recipe_name }),
    list: () => get<Recipe[]>("/recipes"),
  },
  bayesian: {
    init: (variables?: { name: string; min: number; max: number }[]) =>
      post<BayesianInitResponse>("/bayesian/init", { variables }),
    suggest: () =>
      post<{ suggestion: Record<string, unknown> }>("/bayesian/suggest"),
    record: (params: Record<string, number>, score: number, extra?: Record<string, unknown>) =>
      post<BayesianRecordResponse>("/bayesian/record", {
        params,
        score,
        ...extra,
      }),
  },
  shots: {
    list: (method?: string) => {
      const qs = method ? `?method=${method}` : "";
      return get<Shot[]>(`/shots${qs}`);
    },
    add: (shot: Partial<Shot>) => post<Shot>("/shots", shot),
    exportJson: () => fetch(`${BASE}/shots/export`),
  },
};