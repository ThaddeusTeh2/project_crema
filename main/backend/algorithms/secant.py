"""Secant Method for dialing in espresso shot time."""

from dataclasses import dataclass, field

from .grind import GrindSetting


@dataclass
class SecantMethod:
    """Iterative root-finding to reach a target espresso shot time.

    Uses linear interpolation (secant method) between the two most recent
    (grind, time) observations to estimate the next grind setting.

    Converges when |time - target| <= tolerance AND next predicted move
    is less than one micro click (0.1 grind units).
    """

    target_time: float
    tolerance: float = 1.0
    max_iterations: int = 10
    history: list[dict] = field(default_factory=list)
    _converged: bool = field(default=False, init=False)
    _iteration: int = field(default=0, init=False)

    @property
    def converged(self) -> bool:
        return self._converged

    def record_shot(self, grind: GrindSetting, shot_time: float, shot_quality: str = "good") -> dict:
        """Record a shot and return the next grind suggestion.

        Args:
            grind: The grind setting used for this shot.
            shot_time: The measured shot time in seconds.
            shot_quality: "good", "channeling", "scale_error", "grinder_mistake", or "other".
                Non-"good" shots are logged but not fed to the algorithm.

        Returns dict with:
            next_grind: GrindSetting or None (if converged)
            converged: bool
            iteration: int
            error: float | None
            rejected: bool (True if shot was not fed to algorithm)
        """
        if self._converged:
            return {
                "next_grind": None,
                "converged": True,
                "iteration": self._iteration,
                "error": abs(shot_time - self.target_time),
                "rejected": False,
            }

        self._iteration += 1
        entry = {
            "iteration": self._iteration,
            "grind": str(grind),
            "time": shot_time,
            "quality": shot_quality,
        }
        self.history.append(entry)

        if shot_quality != "good":
            return {
                "next_grind": self._existing_next_grind(grind),
                "converged": False,
                "iteration": self._iteration,
                "error": abs(shot_time - self.target_time),
                "rejected": True,
            }

        error = shot_time - self.target_time
        entry["error"] = round(error, 1)

        if abs(error) <= self.tolerance or self._iteration >= self.max_iterations:
            self._converged = True
            return {
                "next_grind": None,
                "converged": True,
                "iteration": self._iteration,
                "error": round(abs(error), 1),
                "rejected": False,
            }

        next_grind = self._compute_next(grind, shot_time)

        current_float = grind.to_float()
        next_float = next_grind.to_float()
        if abs(next_float - current_float) < 0.1:
            self._converged = True
            return {
                "next_grind": None,
                "converged": True,
                "iteration": self._iteration,
                "error": round(abs(error), 1),
                "rejected": False,
            }

        return {
            "next_grind": next_grind,
            "converged": False,
            "iteration": self._iteration,
            "error": round(abs(error), 1),
            "rejected": False,
        }

    def _existing_next_grind(self, current_grind: GrindSetting) -> GrindSetting:
        """When a shot is rejected, return the last valid next_grind or repeat."""
        for h in reversed(self.history):
            if h.get("quality", "good") == "good" and h.get("grind"):
                g = self._parse_grind(h["grind"])
                if str(g) != str(current_grind):
                    return g
        return current_grind

    def _compute_next(self, current_grind: GrindSetting, current_time: float) -> GrindSetting:
        """Compute the next grind using secant interpolation or bisection fallback."""
        g_n = current_grind.to_float()
        t_n = current_time

        if len(self.history) < 2:
            step = self._initial_step(g_n, t_n)
            return GrindSetting.from_float(g_n + step)

        prev = self.history[-2]
        prev_grind = self._parse_grind(prev["grind"])
        g_prev = prev_grind.to_float()
        t_prev = prev["time"]

        if abs(t_n - t_prev) < 0.5:
            return self._bisection_step(current_grind, current_time)

        denom = t_n - t_prev
        g_next = g_n - (t_n - self.target_time) * (g_n - g_prev) / denom
        return GrindSetting.from_float(g_next)

    def _initial_step(self, g_n: float, t_n: float) -> float:
        """Estimate an initial step size based on how far off the time is."""
        error_ratio = (self.target_time - t_n) / self.target_time
        step = -error_ratio * 3.0
        if abs(step) < 0.5:
            step = 0.5 if step >= 0 else -0.5
        return step

    def _bisection_step(self, current_grind: GrindSetting, current_time: float) -> GrindSetting:
        """Fallback: move halfway toward the target direction."""
        error = self.target_time - current_time
        direction = -1.0 if error > 0 else 1.0
        step_size = max(0.5, abs(error) / self.target_time * 2.0)
        g_next = current_grind.to_float() + direction * step_size
        return GrindSetting.from_float(g_next)

    def to_dict(self) -> dict:
        return {
            "target_time": self.target_time,
            "tolerance": self.tolerance,
            "max_iterations": self.max_iterations,
            "history": self.history,
            "converged": self._converged,
            "iteration": self._iteration,
        }

    @staticmethod
    def _parse_grind(s: str) -> GrindSetting:
        s = s.strip()
        macro = int(s[:-1])
        micro = s[-1]
        return GrindSetting(macro=macro, micro=micro)

    @staticmethod
    def from_dict(data: dict) -> "SecantMethod":
        secant = SecantMethod(
            target_time=data["target_time"],
            tolerance=data.get("tolerance", 1.0),
            max_iterations=data.get("max_iterations", 10),
        )
        secant.history = data.get("history", [])
        secant._converged = data.get("converged", False)
        secant._iteration = data.get("iteration", 0)
        return secant