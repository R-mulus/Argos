from dataclasses import dataclass, asdict
import math


@dataclass(frozen=True)
class SeriesConfig:
    interval_s: int = 60
    steps: int = 30
    horizon_s: int = 300
    max_residual_m: float = 15.0
    max_speed_m_s: float = 8.0
    max_gap_s: int = 120
    stationary_m_s: float = 0.1
    moving_m_s: float = 0.5
    noise_floor_m: float = 3.0

    def __post_init__(self):
        if not all(math.isfinite(v) and v > 0 for v in asdict(self).values()):
            raise ValueError('Configuração deve ser positiva e finita')
        if self.steps < 2 or self.horizon_s % self.interval_s or self.stationary_m_s >= self.moving_m_s:
            raise ValueError('Janela, horizonte ou limiares inválidos')


LABELS = ['parado', 'comendo', 'em_movimento', 'outro']
