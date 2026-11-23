import hashlib
import json
import shutil
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

load_dotenv(".env")

from argos_ml.config import SeriesConfig
from argos_ml.preprocessing import features, KEYS
from argos_ml.training import approve_demo, save_json

model_dir = Path("model/artifacts/posicao-piloto-v1")
manifest_path = model_dir / "manifest.json"
sample_path = model_dir / "inference_sample.json"
dataset_path = Path("data/coleta-piloto-gru-v1.json")

manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
cfg = SeriesConfig(**manifest["config"])
rows = dataset["localizacoes"]

# Procura uma sequencia temporal valida no dataset original.
f = features(rows, cfg)
candidate = None

groups = list(f.groupby(KEYS + ["segment"], sort=True))
groups.sort(key=lambda item: item[1].observado_em.max(), reverse=True)

for _, group in groups:
    if len(group) < cfg.steps:
        continue

    window = group.tail(cfg.steps)
    first = window.iloc[0]
    start = first.observado_em - pd.Timedelta(seconds=cfg.interval_s)
    end = window.iloc[-1].observado_em

    selected = []
    for row in rows:
        if any(row.get(key) != first[key] for key in KEYS):
            continue
        if row.get("origem") != manifest["source"]:
            continue
        if row.get("referencial_versao") != manifest["reference"]["version"]:
            continue
        if row.get("calibracao_sha256") != manifest["reference"]["calibration_sha256"]:
            continue

        t = pd.to_datetime(row["observado_em"], utc=True)
        bin_time = t.floor(f"{cfg.interval_s}s")

        if start <= bin_time <= end:
            selected.append(row)

    selected.sort(key=lambda row: row["observado_em"])
    check = features(selected, cfg)

    if len(check) < cfg.steps:
        continue
    tail = check.tail(cfg.steps)
    if tail["segment"].nunique() != 1:
        continue

    candidate = selected
    break

if candidate is None:
    raise ValueError("Nenhuma sequencia valida encontrada no dataset")

# Preserva os arquivos originais.
backup_dir = Path("data/backup-inferencia-piloto-v1")
backup_dir.mkdir(parents=True, exist_ok=True)

shutil.copy2(manifest_path, backup_dir / "manifest.json")
shutil.copy2(sample_path, backup_dir / "inference_sample.json")

original_manifest = manifest_path.read_bytes()
original_sample = sample_path.read_bytes()

try:
    save_json(sample_path, candidate)
    manifest["inference_sample_sha256"] = hashlib.sha256(
        sample_path.read_bytes()
    ).hexdigest()
    save_json(manifest_path, manifest)

    print("AMOSTRA CORRIGIDA:", len(candidate), "registros")
    print("PASSOS EXIGIDOS:", cfg.steps)

    resultado = approve_demo(
        model_dir,
        "Responsavel pelo projeto"
    )

    print("APROVACAO:", resultado["approval_status"])
    print("PRODUCAO:", resultado["approved"])
    print("SUPERA BASELINE:", resultado["improves_baseline"])

except Exception as erro:
    manifest_path.write_bytes(original_manifest)
    sample_path.write_bytes(original_sample)
    print("ARQUIVOS ORIGINAIS RESTAURADOS")
    print("TIPO:", type(erro).__name__)
    print("MOTIVO:", str(erro))
