import json
from dotenv import load_dotenv
load_dotenv(".env")

from argos_ml.inference import Predictor

pasta = "model/artifacts/posicao-piloto-v1"
modelo = Predictor(pasta)

with open(pasta + "/manifest.json", encoding="utf-8") as f:
    manifesto = json.load(f)

with open(pasta + "/inference_sample.json", encoding="utf-8") as f:
    amostra = json.load(f)

previsao = modelo.predict(
    amostra,
    manifesto["property_id"],
    manifesto["reference"]
)

print(json.dumps({
    "status": modelo.status,
    "quantidade_amostras": len(amostra),
    "previsao": previsao
}, indent=2, default=str))
