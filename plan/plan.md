# Crema — Espresso Recipe Optimization App

## Overview

A home barista tool that applies numerical optimization methods to dial in espresso. The core workflow mirrors an experienced barista's mental model: lock all variables except grind, dial in shot time (Secant Method), then maximize taste (Golden Section Search), with a Bayesian Optimizer that learns across all shots for a given coffee bag.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend | Python 3 + Flask | REST API on port 5050 |
| Algorithms | Pure Python + scikit-optimize | Secant, Golden Section, Bayesian GP |
| Frontend | React 18 + Vite + shadcn/ui + Tailwind CSS | UI components and styling |
| Charts | Plotly.js | Bayesian contour plots (predicted taste + uncertainty) |
| Data | JSON files (`data/shots.json`, `data/pipeline_state.json`, `data/recipes.json`, `data/bayesian_sessions.json`) | Persistence |

## Application State Machine

```
                    New Coffee Bag
                          │
                          ▼
┌─────────────────────────────────────────────┐
│  PHASE 1: SETUP                             │
│  - Enter coffee name                        │
│  - Estimate starting grind                  │
│  - Set target shot time (default: 30s)      │
│  - Lock variables: dose, yield, temp,       │
│    preinfusion (only grind varies)          │
│  - Transition to Secant                     │
└──────────────┬──────────────────────────────┘
               ▼
┌─────────────────────────────────────────────┐
│  PHASE 2: SECANT METHOD                     │
│  - Purpose: Reach target shot time          │
│  - Each shot flagged: Good / Channeling /   │
│    Scale Error / Grinder Mistake / Other    │
│  - Only "good" shots feed the algorithm     │
│  - Algorithm: Uses linear interpolation     │
│    between the two most recent valid        │
│    (grind, time) pairs                      │
│  - Convergence: |time - target| ≤ 1.0s      │
│    AND next predicted move < 0.1 grind      │
│    units (one micro click)                  │
│  - Max 10 iterations before forced stop     │
│  - Transition to Golden Section             │
└──────────────┬──────────────────────────────┘
               ▼
┌─────────────────────────────────────────────┐
│  PHASE 3: GOLDEN SECTION SEARCH             │
│  - Purpose: Maximize taste after time is    │
│    dialed in                                │
│  - Bounds: dynamic from secant movement     │
│    (half_width = max(movement×1.5, 2.0))    │
│  - 5-point preference scale:               │
│    Strongly A (-2) < Slightly A (-1) <     │
│    Same (0) < Slightly B (+1) <            │
│    Strongly B (+2)                          │
│  - Algorithm: pairwise comparison of two    │
│    golden-ratio test points, discard        │
│    worse half, retain better point          │
│  - Only 1 new shot needed per iteration     │
│    after the initial pair                   │
│  - Converges when interval ≤ 0.5 points     │
│  - Transition to Save Recipe                │
└──────────────┬──────────────────────────────┘
               ▼
┌─────────────────────────────────────────────┐
│  PHASE 4: SAVE RECIPE                       │
│  - Displays final grind                     │
│  - Pre-fills dose/yield/temp/preinfusion    │
│    from locked pipeline variables           │
│  - User enters recipe name + taste score    │
│    (1-10) + optional taste breakdown        │
│    (sweetness, acidity, bitterness,         │
│    body, balance)                           │
│  - Creates bayesian_seed shot               │
│    (valid_for_model: true)                  │
│  - Recipe references source_shot_id         │
│  - "New Coffee Bag" → resets to Setup       │
└─────────────────────────────────────────────┘

Separate Advanced Tab:
┌─────────────────────────────────────────────┐
│  BAYESIAN OPTIMIZATION (per-coffee)         │
│  - Coffee selector from shot history        │
│  - Seeds from all valid shots for that      │
│    coffee (pipeline recipes, manual shots)  │
│  - Latin Hypercube Sampling: 10 initial     │
│    points spread across 5D space            │
│  - Espresso constraints: yield/dose 1.5-3.0 │
│    dose 14-22g                              │
│  - Expected Improvement + uncertainty per   │
│    suggestion                               │
│  - Model confidence: Low → Medium → Good →  │
│    High based on observation count          │
│  - Plotly contour: predicted taste over     │
│    grind vs dose + uncertainty toggle       │
│  - Taste components: sweetness, acidity,    │
│    bitterness, body, balance                │
│  - valid_for_model flag excludes bad shots  │
└─────────────────────────────────────────────┘
```

## Project File Structure

```
crema/
├── .gitignore
├── README.md
├── CLAUDE.md
├── plan/
│   └── plan.md
└── main/
    ├── backend/
    │   ├── app.py                    # Flask app factory, blueprint registration, static serving
    │   ├── requirements.txt          # flask, numpy, scikit-optimize
    │   ├── store.py                  # JSON I/O for shots, pipeline state, recipes, bayesian sessions
    │   ├── algorithms/
    │   │   ├── __init__.py
    │   │   ├── grind.py              # GrindSetting value object (macro 1-31, micro A-I)
    │   │   ├── secant.py             # SecantMethod with shot quality rejection
    │   │   ├── golden_section.py     # GoldenSectionSearch with 5-point preference scale
    │   │   └── bayesian.py           # BayesianOptimizer with LHS, constraints, uncertainty
    │   └── api/
    │       ├── __init__.py
    │       ├── pipeline_routes.py    # /api/pipeline/start, /state, /reset, /restart-phase
    │       ├── secant_routes.py      # /api/pipeline/secant/record
    │       ├── golden_routes.py      # /api/pipeline/golden/config, /compare
    │       ├── recipe_routes.py      # /api/pipeline/recipe/save, /api/recipes
    │       ├── bayesian_routes.py    # /api/bayesian/init, /suggest, /record, /state, /sessions, /coffees, /reset
    │       └── shots_routes.py       # /api/shots GET/POST/DELETE, /api/shots/export
    ├── frontend/
    │   ├── package.json              # react, vite, shadcn, tailwind, plotly.js-dist-min
    │   ├── vite.config.ts            # Vite config, /api proxy to port 5050
    │   ├── tailwind.config.cjs       # Tailwind + shadcn theme tokens
    │   ├── components.json           # shadcn/ui config
    │   └── src/
    │       ├── main.tsx
    │       ├── App.tsx               # Tab nav: Pipeline | Advanced | Log | Recipes
    │       ├── index.css             # Tailwind directives + shadcn theme CSS vars
    │       ├── types/
    │       │   └── index.ts          # All TypeScript interfaces
    │       ├── lib/
    │       │   └── api.ts            # Typed fetch wrappers for every endpoint
    │       └── components/
    │           ├── ui/               # shadcn primitives (button, card, badge, input, label, checkbox, select)
    │           ├── GrindInput.tsx    # Dual-selector for macro/micro grind settings
    │           ├── PipelineView.tsx  # All 4 pipeline phases inline (Setup, Secant, Golden, Recipe)
    │           ├── BayesianView.tsx  # Coffee selector, EI rationale, contour, taste components
    │           ├── ShotLog.tsx       # Filterable shot table with Clear button
    │           ├── RecipesView.tsx   # Saved recipe list with details
    │           └── GrinderDisclaimer.tsx
    └── data/                         # Gitignored, created at runtime
        ├── shots.json
        ├── pipeline_state.json
        ├── recipes.json
        └── bayesian_sessions.json
```

## API Endpoints

### Pipeline (State Machine)

| Method | Route | Request Body | Response | Description |
|--------|-------|-------------|----------|-------------|
| `POST` | `/api/pipeline/start` | `{ coffee_name, macro, micro, target_time, dose?, yield?, temperature?, preinfusion? }` | `PipelineState` | Start pipeline with locked variables |
| `GET` | `/api/pipeline/state` | — | `PipelineState` | Get full current pipeline state |
| `POST` | `/api/pipeline/reset` | — | `{ ok: true }` | Reset to Setup |
| `POST` | `/api/pipeline/restart-phase` | — | `{ ok, phase, state }` | Rewind one phase (recipe→golden, golden→secant) |

### Secant Method

| Method | Route | Request Body | Response | Description |
|--------|-------|-------------|----------|-------------|
| `POST` | `/api/pipeline/secant/record` | `{ shot_time, shot_quality? }` | `{ next_grind, converged, iteration, error, rejected }` | Record shot, get next grind. `shot_quality` = "good" (default), "channeling", "scale_error", "grinder_mistake", or "other". Non-good shots are rejected. |

### Golden Section Search

| Method | Route | Request Body | Response | Description |
|--------|-------|-------------|----------|-------------|
| `POST` | `/api/pipeline/golden/config` | `{ coarse_macro?, fine_macro?, coarse_micro?, fine_micro? }` | `{ point_a, point_b }` | Set bounds or auto-configure from secant movement |
| `POST` | `/api/pipeline/golden/compare` | `{ preference }` | `{ action, new_point?, retained_point?, converged, width, preference, weight }` | Record comparison. `preference` = "strongly_a", "slightly_a", "same", "slightly_b", or "strongly_b" |

### Recipe

| Method | Route | Request Body | Response | Description |
|--------|-------|-------------|----------|-------------|
| `POST` | `/api/pipeline/recipe/save` | `{ recipe_name, dose?, yield?, temperature?, preinfusion?, taste_score?, taste_components? }` | `{ recipe, seed_shot_id }` | Save recipe + create bayesian_seed shot |
| `GET` | `/api/recipes` | — | `[Recipe]` | List all saved recipes |

### Bayesian Optimization (Advanced)

| Method | Route | Request Body / Query | Response | Description |
|--------|-------|-------------|----------|-------------|
| `POST` | `/api/bayesian/init` | `{ coffee_name, n_initial? }` | `{ first_suggestion, coffee_name, shot_count, seed_count, total_observations, confidence }` | Per-coffee GP init, seeds from existing valid shots |
| `POST` | `/api/bayesian/suggest` | `{ coffee_name }` | `{ suggestion }` | Next experiment with EI rationale + constraints check |
| `POST` | `/api/bayesian/record` | `{ coffee_name, params, score, shot_time?, valid_for_model?, valid_reason?, taste_components?, notes? }` | `{ recorded, score, history_count, total_observations, suggestion?, ei_rationale?, contour_data?, confidence }` | Record result, update GP |
| `GET` | `/api/bayesian/state` | `?coffee_name=` | `{ coffee_name, initialized, history, history_count, total_observations, confidence, variables }` | Session status |
| `GET` | `/api/bayesian/sessions` | — | `[{ coffee_name, observations, total, initialized }]` | List all saved sessions |
| `POST` | `/api/bayesian/reset` | `{ coffee_name }` | `{ ok: true }` | Delete a session |
| `GET` | `/api/bayesian/coffees` | — | `[{ coffee_name, total_shots, valid_for_model }]` | Coffees with shot counts for selector |

### Shot Log

| Method | Route | Query Params | Response | Description |
|--------|-------|-------------|----------|-------------|
| `GET` | `/api/shots` | `?coffee=&method=&limit=` | `[Shot]` | List shots with optional filters |
| `POST` | `/api/shots` | `Shot` object | `Shot` | Manually log a shot |
| `DELETE` | `/api/shots` | — | `{ ok: true }` | Clear all shots |
| `GET` | `/api/shots/export` | — | JSON file download | Export all shots as JSON |

## Core Data Types

### GrindSetting

```
GrindSetting {
  macro: int       // 1-31, where 1 is finest grind
  micro: string    // "A"-"I", where "A" is finest micro
}

String: "17C"
Float:  17.2     (A=0.0, B=0.1, ..., I=0.8)
```

Lower float = finer grind. Algorithm math works on floats. Conversion back to macro/micro handles clamping and snapping.

### Shot

```
Shot {
  id: string                    // Sequential integer
  coffee_name: string           // Which bag of beans
  timestamp: string             // ISO 8601
  grind_macro: int              // 1-31
  grind_micro: string           // A-I
  dose: float | null            // grams
  yield: float | null           // grams
  temperature: float | null     // °C
  preinfusion: float | null     // seconds
  shot_time: float | null       // seconds
  taste_score: float | null     // 1-10
  taste_components: {           // optional breakdown
    sweetness?: float           // 1-10
    acidity?: float             // 1-10
    bitterness?: float          // 1-10
    body?: float                // 1-10
    balance?: float             // 1-10
  } | null
  method: string                // "secant" | "secant_start" | "golden_test" | "golden_compare" | "bayesian" | "bayesian_seed" | "manual"
  notes: string | null
  valid_for_model: boolean      // Train GP on this shot?
  valid_reason: string | null   // Explanation if excluded
  shot_quality?: string         // "good" | "channeling" | "scale_error" | "grinder_mistake" | "other"
}
```

### PipelineState

```
PipelineState {
  phase: "setup" | "secant" | "golden" | "recipe"
  coffee_name: string
  target_time: float
  starting_grind: GrindSetting | null
  locked_vars: {
    dose: float
    yield: float
    temperature: float
    preinfusion: float
  } | null
  secant: {
    active: boolean
    converged: boolean
    history: [{ iteration, grind, time, error?, quality }]
    next_grind: string | null
    iteration: int
    error: float | null
    target_time: float
  } | null
  golden: {
    active: boolean
    converged: boolean
    coarse: GrindSetting
    fine: GrindSetting
    point_a: string | null
    point_b: string | null
    retained_point: string | null
    new_point: string | null
    width: float
    iteration: int
    history: [{ iteration, point_a, point_b, preference, weight, action }]
    best_grind: string | null
  } | null
  recipe: {
    saved: boolean
    recipe_name: string | null
    final_grind: string | null
  } | null
  started_at?: string
}
```

### Recipe

```
Recipe {
  name: string
  coffee_name: string
  grind: string | null           // e.g., "17C"
  dose: float | null
  yield: float | null
  temperature: float | null
  preinfusion: float | null
  target_time: float
  saved_at: string               // ISO 8601
  secant_history: SecantHistoryEntry[]
  golden_converged: boolean
  source_shot_id: string | null  // References the bayesian_seed shot
}
```

## Data Hierarchy

```
Coffee Bag (coffee_name)
│
├── Shot 1 (secant)           valid_for_model = false
├── Shot 2 (secant)           valid_for_model = false
├── Shot 3 (secant, good)     valid_for_model = false
├── Shot 4 (golden_test A)    valid_for_model = false
├── Shot 5 (golden_test B)    valid_for_model = false
├── Shot 6 (golden_compare)   valid_for_model = false
├── Shot 7 (bayesian_seed)    valid_for_model = true   ← recipe saved
│
├── Shot 8 (bayesian)         valid_for_model = true   ← Advanced tab
├── Shot 9 (bayesian)         valid_for_model = true
├── Shot 10 (bayesian, invalid) valid_for_model = false ← channeling
│
└── Recipe A                  source_shot_id → Shot 7
```

Shots train the GP. Recipes are bookmarks — they reference shots, they don't duplicate data.

## Algorithm Details

### Secant Method (`algorithms/secant.py`)

Iterative root-finding using linear interpolation between the two most recent valid (grind, time) observations.

**Shot Quality**: Each recorded shot is marked as "good", "channeling", "scale_error", "grinder_mistake", or "other". Only "good" shots feed the secant formula. Rejected shots return the last valid next_grind.

**Secant formula**:
```
g_next = g_n - (t_n - target) * (g_n - g_{n-1}) / (t_n - t_{n-1})
```

**Edge cases**:
- `|t_n - t_{n-1}| < 0.5s` → bisection fallback
- Suggested grind outside [1.0, 31.8] → clamped

**Convergence**: `|time - target| ≤ 1.0s` AND `|g_next - g_n| < 0.1` (one micro click). Both conditions must be met. Max 10 iterations.

### Golden Section Search (`algorithms/golden_section.py`)

Finds the maximum of a unimodal taste curve using the golden ratio φ = (1 + √5)/2.

**5-point preference scale**: strongly_a (-2), slightly_a (-1), same (0), slightly_b (+1), strongly_b (+2). Weight ≤ 0 → discard right side; weight > 0 → discard left side. "Same" defaults to discarding the right side.

**Dynamic bounds from secant**: `half_width = max(secant_movement × 1.5, 2.0)` where movement is the distance between first and last good secant grinds. Minimum ±2 macro steps, scales with how far secant had to move.

**Initialization**: Two shots at golden-ratio test points. Every subsequent iteration needs only 1 new shot.

**Convergence**: interval width ≤ 0.5 float grind units (~5 micro steps).

### Bayesian Optimization (`algorithms/bayesian.py`)

Per-coffee Gaussian Process regression with Expected Improvement acquisition using `scikit-optimize`.

**Variables** (5D optimization space):
| Variable | Range | Unit |
|----------|-------|------|
| grind | 1.0 – 31.8 | float |
| dose | 14.0 – 22.0 | g |
| yield | 24.0 – 50.0 | g |
| temperature | 88.0 – 98.0 | °C |
| preinfusion | 0.0 – 15.0 | s |

**Key features**:
- **Latin Hypercube Sampling**: 10 initial points (2 × number of variables) spread evenly across the space
- **Pipeline seeding**: Any existing shots for the coffee with `valid_for_model: true` and `taste_score` are fed to the GP before LHS points
- **Espresso constraints**: yield/dose ratio 1.5–3.0, dose 14–22g
- **Uncertainty**: `contour_data()` returns both predicted taste (z) and model uncertainty (z_std) for Plotly overlay
- **EI rationale**: Every suggestion includes predicted score, uncertainty, current best, and expected improvement
- **Score negation**: GP models maximization of taste (1–10) via minimization of -score
- **Confidence labels**: Low (<3 observations), Medium (<8), Good (<15), High (≥15)
- **Persistence**: Sessions stored per-coffee in `bayesian_sessions.json`

## Data Flow

```
User Action → React Component → api.ts fetch → Flask API Route
                                                    │
                                         Algorithm Class (stateless calc)
                                                    │
                                         store.py (read/write JSON files)
                                                    │
                                         JSON Response → React State → Re-render
```

Pipeline state, shots, recipes, and Bayesian sessions are all persisted server-side as JSON files. On each API call, the server loads current state, applies the algorithm, persists updated state, and returns the result.

## Backend Conventions

- Type hints on all function signatures
- Google-style docstrings for public classes and methods
- Blueprints registered in `app.py` with URL prefixes
- All errors return `{ "error": "message" }` with appropriate HTTP status
- GrindSettings always use the `GrindSetting` value object
- `store.py` is the single point of filesystem I/O
- Bayesian sessions are per-coffee, stored in a dict keyed by coffee_name

## Frontend Conventions

- Functional components with React hooks only
- All API calls through `lib/api.ts` — components never call `fetch` directly
- TypeScript strict mode, all props and state typed
- shadcn/ui components for all UI primitives
- Tailwind for layout/spacing, CSS custom properties for theming
- Coffee-brown accent: `#8B4513`

## Running

### Development

```bash
# Terminal 1: Backend (port 5050)
cd main/backend
pip install -r requirements.txt
python app.py

# Terminal 2: Frontend (port 5173, proxies /api → 5050)
cd main/frontend
npm install
npm run dev
```

### Production

```bash
cd main/frontend && npm run build
cd ../backend && python app.py    # Flask serves dist/ on port 5050
```

## Future Enhancements

- Additional grinder models (Niche Zero, DF64, EK43)
- Grinder calibration tracking (burr age, shim count, approach direction)
- Bean aging metadata (roast date, days off roast, humidity)
- Brew method support (pour-over, AeroPress)
- Shot time vs grind / taste vs grind scatter plots
- Community recipe sharing