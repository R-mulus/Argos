#!/usr/bin/env python3
"""Argos Monitor Live: painel local somente leitura do Supabase.

Nao altera dados, nao se conecta ao MQTT nem interfere nos workers.
Faz as consultas em uma thread para a pagina nunca ficar presa num GET lento.
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

try:
    import requests
    from dotenv import load_dotenv
except ImportError as exc:
    print("DEPENDENCIA AUSENTE: instale requests e python-dotenv no ambiente Python do Argos.", file=sys.stderr)
    raise SystemExit(4) from exc

HERE = Path(__file__).resolve().parent
ROOT = Path(os.getenv("ARGOS_REPO_ROOT", str(HERE.parent))).resolve()
ENV_FILE = Path(os.getenv("ARGOS_MONITOR_ENV_FILE", str(ROOT / "ml" / ".env"))).resolve()
load_dotenv(ENV_FILE, override=False)

HOST = "127.0.0.1"  # Nunca expor as credenciais de backend na rede.
PORT = int(os.getenv("ARGOS_MONITOR_PORT", "8765"))
URL = os.getenv("SUPABASE_URL", "").rstrip("/")
KEY = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
PROPERTY_ID = os.getenv("ARGOS_PROPERTY_ID", "").strip()
PREFERRED_TX = os.getenv("ARGOS_MONITOR_TX_ID", "").strip()
REFERENCE_VERSION = os.getenv("ARGOS_REFERENCE_VERSION", "").strip()
CALIBRATION_HASH = os.getenv("ARGOS_CALIBRATION_SHA256", "").strip()
REFRESH_SECONDS = 3.0


def check_config():
    if not URL.startswith("https://") or not KEY or not PROPERTY_ID:
        return (
            "Configuracao incompleta: verifique SUPABASE_URL, "
            "SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY) e ARGOS_PROPERTY_ID "
            "no arquivo ml/.env."
        )
    try:
        UUID(PROPERTY_ID)
        if PREFERRED_TX:
            UUID(PREFERRED_TX)
    except ValueError:
        return "ARGOS_PROPERTY_ID ou ARGOS_MONITOR_TX_ID nao e um UUID valido."
    if not (1024 <= PORT <= 65535):
        return "ARGOS_MONITOR_PORT deve estar entre 1024 e 65535."
    return None


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def http_error_details(response):
    """Exibe somente mensagens de estrutura do banco; nunca as credenciais."""
    try:
        body = response.json()
        if isinstance(body, dict):
            raw = " ".join(str(body.get(k, "")) for k in ("code", "message"))
            raw = re.sub(r"[\r\n]+", " ", raw).strip()
            if raw:
                # As chaves nunca pertencem ao corpo esperado de erro; censura por precaucao.
                raw = raw.replace(KEY, "[redigido]") if KEY else raw
                return raw[:220]
    except (ValueError, TypeError):
        pass
    return "Confira tabela, colunas, permissoes e filtros."


class SupabaseReadOnly:
    def __init__(self, progress=None):
        self.session = requests.Session()
        self.session.headers.update({
            "apikey": KEY,
            "Authorization": "Bearer " + KEY,
            "Accept": "application/json",
        })
        self.progress = progress

    def rows(self, table, **filters):
        if self.progress:
            self.progress("Consultando " + table)
        parameters = (
            {"id": "eq." + PROPERTY_ID, **filters}
            if table == "propriedades"
            else {"propriedade_id": "eq." + PROPERTY_ID, **filters}
        )
        try:
            response = self.session.get(
                URL + "/rest/v1/" + table,
                params=parameters,
                timeout=(2.5, 5.0),
            )
            response.raise_for_status()
            result = response.json()
            if not isinstance(result, list):
                raise RuntimeError("Resposta inesperada da tabela " + table)
            return result
        except requests.HTTPError as exc:
            r = exc.response
            status = r.status_code if r is not None else "?"
            details = http_error_details(r) if r is not None else ""
            raise RuntimeError(f"Supabase HTTP {status} na tabela {table}: {details}") from None
        except requests.RequestException as exc:
            kind = "tempo limite excedido" if isinstance(exc, requests.Timeout) else "falha de conexao"
            raise RuntimeError(
                f"Supabase: {kind} ao consultar {table}. Confira internet e SUPABASE_URL."
            ) from None

    def close(self):
        self.session.close()


def latest_per_receiver(records):
    """Uma medida por receptor no MESMO evento, sem misturar horarios."""
    latest = {}
    for record in records:
        rid = record.get("receptor_id")
        if rid and rid not in latest:
            latest[rid] = record
    return latest


def build_snapshot(db):
    devices = db.rows(
        "dispositivos", select="id,codigo,nome,tipo,status", order="codigo.asc", limit="80"
    )
    devices_by_id = {d["id"]: d for d in devices}
    anchor_rows = db.rows(
        "argos_posicoes_receptores",
        select="receptor_id,x_m,y_m,rssi_1m_dbm,expoente_perda,atualizado_em",
        order="receptor_id.asc", limit="20"
    )

    position_filter = dict(
        select="transmissor_id,animal_id,evento_id,x_m,y_m,erro_residual_m,receptores_utilizados,observado_em,calculado_em,origem,referencial_versao",
        origem="eq.experimental",
        observado_em="not.is.null",
        order="observado_em.desc",
        limit="1",
    )
    if PREFERRED_TX:
        position_filter["transmissor_id"] = "eq." + PREFERRED_TX
    if REFERENCE_VERSION:
        position_filter["referencial_versao"] = "eq." + REFERENCE_VERSION
    if CALIBRATION_HASH:
        position_filter["calibracao_sha256"] = "eq." + CALIBRATION_HASH
    head = db.rows("argos_localizacoes", **position_filter)
    top = head[0] if head else None
    tx_id = PREFERRED_TX or (top.get("transmissor_id") if top else None)

    if not tx_id:
        recent = db.rows(
            "deteccoes", select="transmissor_id,evento_id,recebido_em",
            order="recebido_em.desc", limit="1"
        )
        tx_id = recent[0].get("transmissor_id") if recent else None

    trail = []
    last_ingest = None
    latest_event_id = None
    readings = {}
    if tx_id:
        trail_filters = {
            "transmissor_id": "eq." + tx_id,
            "origem": "eq.experimental",
            "observado_em": "not.is.null",
            "order": "observado_em.desc",
            "limit": "90",
        }
        if REFERENCE_VERSION:
            trail_filters["referencial_versao"] = "eq." + REFERENCE_VERSION
        if CALIBRATION_HASH:
            trail_filters["calibracao_sha256"] = "eq." + CALIBRATION_HASH
        trail_desc = db.rows(
            "argos_localizacoes",
            select="evento_id,animal_id,x_m,y_m,erro_residual_m,receptores_utilizados,observado_em,calculado_em,referencial_versao",
            **trail_filters,
        )
        trail = list(reversed(trail_desc))
        if not top and trail_desc:
            top = trail_desc[0]
        ingest = db.rows(
            "deteccoes", select="evento_id,recebido_em",
            transmissor_id="eq." + tx_id,
            order="recebido_em.desc", limit="1"
        )
        if ingest:
            last_ingest = ingest[0].get("recebido_em")
            latest_event_id = ingest[0].get("evento_id")
            if latest_event_id:
                matching = db.rows(
                    "deteccoes",
                    select="receptor_id,rssi_dbm,detectado_em,recebido_em,evento_id",
                    transmissor_id="eq." + tx_id,
                    evento_id="eq." + latest_event_id,
                    order="recebido_em.desc", limit="20",
                )
                readings = latest_per_receiver(matching)

    anchors = []
    for i, r in enumerate(sorted(anchor_rows, key=lambda x: (float(x["x_m"]), float(x["y_m"])))):
        did = r["receptor_id"]
        d = devices_by_id.get(did, {})
        measurement = readings.get(did, {})
        anchors.append({
            "id": did,
            "codigo": d.get("codigo") or "RX-" + str(i + 1).zfill(3),
            "nome": d.get("nome") or "Receptor",
            "x_m": r.get("x_m"),
            "y_m": r.get("y_m"),
            "rssi_1m_dbm": r.get("rssi_1m_dbm"),
            "expoente_perda": r.get("expoente_perda"),
            "rssi_dbm": measurement.get("rssi_dbm"),
            "medido_em": measurement.get("detectado_em"),
            "recebido_em": measurement.get("recebido_em"),
        })
    anchors.sort(key=lambda r: r["codigo"])

    tx = devices_by_id.get(tx_id, {}) if tx_id else {}
    property_names = db.rows("propriedades", select="id,nome", limit="1")
    return {
        "server_time": utc_now(),
        "propriedade": property_names[0]["nome"] if property_names else "Propriedade",
        "transmissor": {
            "id": tx_id,
            "codigo": tx.get("codigo") or "TX",
            "nome": tx.get("nome") or "Transmissor",
        },
        "posicao": top,
        "trilha": trail,
        "receptores": anchors,
        "ultimo_pacote_em": last_ingest,
        "evento_rssi": latest_event_id,
        "evento_posicao": top.get("evento_id") if top else None,
        "dados_evento": len(readings),
        "observacao": "Posicao experimental RSSI; nao e GPS nem geolocalizacao certificada.",
        "somente_leitura": True,
    }


class LiveStore:
    """Publica sempre um estado HTTP imediato, mesmo se Supabase estiver lento."""

    def __init__(self, config_error=None):
        self.lock = threading.Lock()
        self.snapshot = None
        self.error = config_error
        self.config_error = config_error
        self.refreshing = False
        self.phase = "Aguardando primeira consulta"
        self.started = 0.0
        self.completed = 0.0
        self.successful_at = None

    def set_phase(self, phase):
        with self.lock:
            self.phase = phase

    def trigger(self):
        if self.config_error:
            return
        with self.lock:
            now = time.monotonic()
            if self.refreshing or (self.started > 0 and now - self.started < REFRESH_SECONDS):
                return
            self.refreshing = True
            self.started = now
            self.phase = "Iniciando consulta ao Supabase"
        threading.Thread(target=self._refresh, name="argos-supabase-readonly", daemon=True).start()

    def _refresh(self):
        error = None
        snapshot = None
        db = SupabaseReadOnly(progress=self.set_phase)
        try:
            snapshot = build_snapshot(db)
        except Exception as exc:
            error = str(exc) or type(exc).__name__
            print("[monitor] " + error, file=sys.stderr)
        finally:
            db.close()
            with self.lock:
                if snapshot is not None:
                    self.snapshot = snapshot
                    self.successful_at = utc_now()
                self.error = error
                self.completed = time.monotonic()
                self.refreshing = False
                self.phase = "Pronto" if error is None else "Falha na consulta"

    def payload(self):
        self.trigger()
        with self.lock:
            if self.snapshot is not None:
                result = dict(self.snapshot)
                result.update({
                    "estado": "ok" if self.error is None else "desatualizado",
                    "erro_atualizacao": self.error,
                    "atualizando": self.refreshing,
                    "ultima_sincronizacao": self.successful_at,
                })
                return 200, result
            if self.error:
                return 503, {
                    "estado": "erro", "erro": self.error,
                    "etapa": self.phase, "somente_leitura": True,
                }
            elapsed = max(0, int(time.monotonic() - self.started)) if self.started else 0
            return 200, {
                "estado": "carregando",
                "etapa": self.phase,
                "segundos": elapsed,
                "aviso": "Consulta inicial em andamento" if elapsed < 15 else "Consulta lenta; confira terminal e conectividade do Supabase",
                "somente_leitura": True,
            }

    def health(self):
        with self.lock:
            return {
                "servico": "argos-monitor",
                "somente_leitura": True,
                "configuracao_valida": self.config_error is None,
                "arquivo_env_encontrado": ENV_FILE.is_file(),
                "estado": "erro" if self.error and self.snapshot is None else "consultando" if self.refreshing else "pronto" if self.snapshot is not None else "aguardando",
                "etapa": self.phase,
                "erro": self.error,
                "ultima_sincronizacao": self.successful_at,
            }


STORE = LiveStore(check_config())


class Handler(BaseHTTPRequestHandler):
    server_version = "ArgosMonitor/1.1"
    sys_version = ""

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/") and len(args) > 1 and str(args[1]) == "200":
            return
        sys.stderr.write("[monitor] " + (fmt % args) + "\n")

    def respond(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def json_response(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False, default=str).encode("utf-8")
        self.respond(status, body, "application/json; charset=utf-8")

    def do_GET(self):
        path = urlsplit(self.path).path
        if path in ("/", "/index.html"):
            self.respond(200, (HERE / "index.html").read_bytes(), "text/html; charset=utf-8")
        elif path == "/api/live":
            status, result = STORE.payload()
            self.json_response(status, result)
        elif path == "/api/health":
            self.json_response(200, STORE.health())
        else:
            self.respond(404, b"Nao encontrado", "text/plain; charset=utf-8")


def main():
    error = check_config()
    print("\n" + "=" * 58)
    print(" ARGOS | MONITOR DE LOCALIZACAO AO VIVO | v1.1")
    print("=" * 58)
    print(" Fonte: Supabase REST (somente leitura)")
    print(" Configuracao encontrada: " + ("SIM" if ENV_FILE.is_file() else "NAO"))
    print(" Parar: Ctrl+C")
    if error:
        print(" ATENCAO: " + error)
        print(" Abra /api/health para verificar o diagnostico.")
    print("=" * 58 + "\n")

    # Evita abrir silenciosamente a instancia antiga na porta 8765.
    chosen_port = None
    server = None
    for port in range(PORT, min(PORT + 10, 65536)):
        try:
            server = ThreadingHTTPServer((HOST, port), Handler)
            chosen_port = port
            break
        except OSError:
            continue
    if server is None:
        print("ERRO: portas ocupadas. Feche o monitor antigo e execute novamente.", file=sys.stderr)
        raise SystemExit(3)
    target = f"http://{HOST}:{chosen_port}"
    print(" MONITOR: " + target)
    print(" DIAGNOSTICO: " + target + "/api/health")
    if chosen_port != PORT:
        print(f" AVISO: porta {PORT} em uso; usando {chosen_port} (feche o monitor antigo).")
    STORE.trigger()
    try:
        with server:
            if os.getenv("ARGOS_MONITOR_AUTO_OPEN") == "1":
                threading.Timer(0.75, lambda: webbrowser.open(target)).start()
            server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\nMonitor encerrado.")


if __name__ == "__main__":
    main()
