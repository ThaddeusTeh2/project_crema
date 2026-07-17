# Crema — Espresso Recipe Optimization

## Stack
- Backend: Python 3 + Flask (REST API on port 5050)
- Frontend: React 18 + Vite + shadcn/ui + Tailwind CSS (dev on port 5173, proxies /api → 5050)
- Data: JSON files at `main/data/`
- Optimization: scikit-optimize (Bayesian GP), custom Python (Secant, Golden Section)

## Running

### Backend
```bash
cd main/backend
pip install -r requirements.txt
python app.py
```

### Frontend (Development)
```bash
cd main/frontend
npm install
npm run dev
```

### Production Build
```bash
cd main/frontend && npm run build
cd ../backend && python app.py
```
Flask serves the built frontend from `main/frontend/dist/`.

## Project Conventions

### Python
- Type hints on all function signatures
- Google-style docstrings for public classes and methods
- Blueprints registered in `app.py` with URL prefixes
- All API errors return `{ "error": "message" }` with appropriate HTTP status
- Grind settings always use the `GrindSetting` value object, never raw tuples
- `store.py` is the single point of filesystem I/O

### React / TypeScript
- Functional components with React hooks only
- All API calls go through `src/lib/api.ts` — components never call `fetch` directly
- shadcn/ui components for all UI primitives
- Tailwind for layout and spacing; CSS custom properties for theming
- Coffee-brown accent color: `#8B4513`

### TypeScript
- Strict mode enabled
- All component props and state are typed
- Types defined in `src/types/index.ts`

## Key Types

### GrindSetting
```python
GrindSetting {
  macro: 1-31       # 1 = finest
  micro: "A"-"I"    # A = finest
}
# String: "17C"
# Float: 17.2 (for algorithm math)
```

### PipelineState
The pipeline state machine flows: `setup → secant → golden → recipe`
Each phase stores its own sub-state (history, convergence, etc.)

## API Overview

All endpoints return JSON. See `plan/plan.md` for the full API specification.

### Pipeline Lifecycle
- `POST /api/pipeline/start` — Begin a new coffee dial-in
- `GET /api/pipeline/state` — Get current pipeline state
- `POST /api/pipeline/reset` — Reset to setup phase

### Secant Method
- `POST /api/pipeline/secant/record` — Record shot time, get next grind

### Golden Section
- `POST /api/pipeline/golden/config` — Set bounds or auto-configure from secant
- `POST /api/pipeline/golden/compare` — Record which tasted better

### Recipe
- `POST /api/pipeline/recipe/save` — Save final recipe
- `GET /api/recipes` — List all saved recipes

### Bayesian (Advanced)
- `POST /api/bayesian/init` — Initialize GP model
- `POST /api/bayesian/suggest` — Get next experiment suggestion
- `POST /api/bayesian/record` — Record result, update model

### Shot Log
- `GET /api/shots` — List all shots (supports `?method=` filter)
- `POST /api/shots` — Manually log a shot
- `GET /api/shots/export` — Download JSON export

## Adding a New Grinder

1. Create a new grind model class or extend `GrindSetting` in `algorithms/grind.py`
2. The core algorithm classes operate on float values (via `GrindSetting.to_float()`), so any grind model that can convert to a continuous float will work
3. Update `GrindInput.tsx` in the frontend with the new grinder's macro/micro scales
4. Update the `GrinderDisclaimer.tsx` component