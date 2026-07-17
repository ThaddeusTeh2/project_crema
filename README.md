# ☕ Crema — Espresso Recipe Optimization

A home barista tool for dialing in espresso using numerical optimization methods.

## Why

Most baristas dial in espresso by intuition — adjust grind, pull a shot, taste, repeat. Crema formalizes this process with proven mathematical optimization:

- **Secant Method** — Fastest path to your target shot time (2-3 shots typically), with channeling/error detection
- **Golden Section Search** — Maximize taste with minimal waste (1 new shot per iteration), using 5-point preference scale
- **Bayesian Optimization** — Per-coffee multi-variable tuning with Gaussian Process regression, seeded from pipeline data

## Workflow

```
New Coffee → Lock Dose/Yield/Temp/Preinfusion → Secant (dial time) → Golden (max taste) → Save Recipe + Taste Score → Bayesian Seed
```

Every completed pipeline recipe becomes a seed observation for the Bayesian optimizer. The GP learns from all shots across the coffee bag, not just the final recipe.

## Installation

### Prerequisites
- Python 3.10+
- Node.js 18+
- A Baratza Sette 270 grinder (default calibration)

### Setup

```bash
cd crema

# Backend
cd main/backend
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### Run

**Development** (two terminals):
```bash
# Terminal 1: Backend
cd main/backend && python app.py    # port 5050

# Terminal 2: Frontend
cd main/frontend && npm run dev      # port 5173, proxies /api to 5050
```

**Production**:
```bash
cd main/frontend && npm run build
cd ../backend && python app.py       # Flask serves everything on port 5050
```

## Usage

### Pipeline (Quick Start)

1. **Setup** — Enter coffee name, starting grind, target shot time, and lock your other variables (dose, yield, temperature, preinfusion). Only grind varies.
2. **Secant Method** — Pull shots at suggested grinds, record times. Flag bad shots (channeling, scale error, grinder mistake) — they're logged but excluded from the algorithm. Converges when within ±1s of target AND next predicted move < 1 micro click.
3. **Golden Section** — Compare pairs of shots on a 5-point scale: Strongly A, Slightly A, Same, Slightly B, Strongly B. The interval narrows each iteration with only 1 new shot needed.
4. **Save Recipe** — Enter recipe name, confirm dose/yield/temp/preinfusion, add a taste score (1-10) and optional taste breakdown (sweetness, acidity, bitterness, body, balance). This shot is marked `valid_for_model: true` and becomes a seed for the Bayesian optimizer.

### Advanced (Bayesian)

Per-coffee Gaussian Process optimizer. Seeds automatically from pipeline recipes and manually logged shots with taste scores. Features:
- **Coffee selector** — choose from any coffee with shot history
- **Model confidence indicator** — progresses from Low → Medium → Good → High as observations accumulate
- **Latin Hypercube Sampling** — 10 initial exploration points spread evenly across the 5D space
- **EI rationale** — shows predicted score ± uncertainty, current best, and expected improvement for every suggestion
- **Taste components** — optional breakdown into sweetness, acidity, bitterness, body, balance
- **Shot quality flag** — exclude bad shots (channeling, scale errors) from model training
- **Contour plot** — grind vs dose predicted taste surface with toggleable uncertainty overlay
- **Espresso constraints** — ensures suggestions honor yield/dose ratios (1.5–3.0) and dose bounds (14–22g)

### Shot Log

View and filter all shots by method or coffee. Export as JSON. Clear when needed.

### Recipes

Bookmark view of saved recipes. Each recipe stores dose, yield, temperature, and preinfusion alongside grind — no duplicated data, recipes reference shots.

## Grinder Calibration

Default grind settings are mapped to the **Baratza Sette 270**:
- **Macro**: 1–31 (1 = finest, 31 = coarsest)
- **Micro**: A–I (A = finest, I = coarsest)

Lower float values = finer grind. The algorithms work internally with continuous floats — you can add support for other grinders by extending the `GrindSetting` class.

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3 + Flask |
| Optimization | scikit-optimize (Bayesian GP), custom (Secant, Golden Section) |
| Visualization | Plotly.js (contour with uncertainty) |
| Frontend | React 18 + Vite + shadcn/ui + Tailwind CSS |
| Data | JSON file persistence |

## License

MIT