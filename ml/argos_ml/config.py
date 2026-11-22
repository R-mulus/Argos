from dataclasses import dataclass, asdict
import math
import os


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
        if any(type(v) is not int for v in (self.steps,self.interval_s,self.horizon_s,self.max_gap_s)):
            raise ValueError('Passos e intervalos devem ser inteiros')
        if self.steps>256 or self.interval_s>3600 or self.horizon_s>86400:
            raise ValueError('Configuracao_temporal_fora_dos_limites')

    @classmethod
    def environment(cls):
        defaults=cls()
        return cls(**{key:type(value)(os.getenv('ARGOS_'+key.upper(),value)) for key,value in asdict(defaults).items()})


LABELS = ['parado', 'comendo', 'em_movimento', 'outro']
