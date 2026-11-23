"""Contrato público persistido; nunca expõe arquivos, scalers ou dados de treino."""
from datetime import datetime, timezone


def public_metadata(m):
    metrics={k:m['evaluation'][k] for k in ('mae_m','rmse_m','classification_accuracy') if k in m['evaluation']}
    return dict(propriedade_id=m['property_id'],task=m['task'],model_version=m['model_version'],
        approval_status=m.get('approval_status','production_approved'),approved=bool(m['approved']),
        origem=m['source'],referencial_versao=m['reference']['version'],calibracao_sha256=m['reference']['calibration_sha256'],
        training_samples=m['training_samples'],model_parameters=m['model_parameters'],tensorflow_version=m['tensorflow_version'],
        prediction_horizon_minutes=m['prediction_horizon_minutes'],inference_time_ms=m['inference_time_ms'],
        evaluation=metrics,atualizado_em=datetime.now(timezone.utc).isoformat())
