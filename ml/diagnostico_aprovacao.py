from dotenv import load_dotenv
load_dotenv(".env")

from argos_ml.training import approve_demo

try:
    resultado = approve_demo(
        "model/artifacts/posicao-piloto-v1",
        "Responsavel pelo projeto"
    )
    print("RESULTADO:", resultado["approval_status"])
except Exception as erro:
    print("TIPO:", type(erro).__name__)
    print("MOTIVO:", str(erro))
