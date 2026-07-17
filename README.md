# ☕ Crema — Espresso Recipe Optimization

A home barista tool for dialing in espresso using numerical optimization methods.

## Why

Most baristas dial in espresso by intuition — adjust grind, pull a shot, taste, repeat. Crema formalizes this process with proven mathematical optimization:

- **Secant Method** — Fastest path to your target shot time (2-3 shots typically)
- **Golden Section Search** — Maximize taste with minimal waste (1 new shot per iteration)
- **Bayesian Optimization** — Multi-variable recipe tuning with Gaussian Process regression

## Workflow

```
New Coffee → Estimate Grind → Secant (dial time) → Golden (max taste) → Save Recipe
```

## Installation

### Prerequisites
- Python 3.10+
- Node.js 18+
- A Baratza Sette 270 grinder (default calibration; support for other grinders coming soon)

### Setup

```bash
# Clone and enter project
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
cd main/frontend && npm run dev      # port 5173, proxies API to 5050
```

**Production**:
```bash
cd main/frontend && npm run build
cd ../backend && python app.py       # Flask serves everything on port 5050
```

## Usage

### Pipeline (Quick Start)

1. **Setup** — Enter coffee name, starting grind, target shot time
2. **Secant Method** — Pull shots at suggested grinds, record times. Converges when within ±1s of target.
3. **Golden Section** — Compare pairs of shots. Which tastes better? Narrow the interval. 1 new shot per iteration.
4. **Save Recipe** — Name and save. Ready for your next bag.

### Advanced (Bayesian)

Optimize across multiple variables simultaneously — grind, dose, yield, temperature, pre-infusion — using accumulated shot data.

### Shot Log

View and filter all your shots. Export as JSON for external analysis.

## Grinder Calibration

Default grind settings are mapped to the **Baratza Sette 270**:
- **Macro**: 1–31 (1 = finest, 31 = coarsest)
- **Micro**: A–I (A = finest, I = coarsest)

If you use a different grinder, the algorithms work internally with continuous values — you can add support by extending the `GrindSetting` class.

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3 + Flask |
| Optimization | scikit-optimize (Bayesian GP), custom (Secant, Golden Section) |
| Frontend | React 18 + Vite + shadcn/ui + Tailwind CSS |
| Data | JSON file persistence |

## License

MIT