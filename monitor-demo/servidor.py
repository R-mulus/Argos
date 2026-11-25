#!/usr/bin/env python3
"""Argos Monitor Live: painel local somente leitura do Supabase.

Nao altera dados, nao se conecta ao MQTT nem interfere nos workers.
Faz as consultas em uma thread para a pagina nunca ficar presa num GET lento.
"""
from __future__ import annotations

import json
import math
import hashlib
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
REFRESH_SECONDS = 1.0


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


def stamp(value):
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return d.timestamp() if d.tzinfo else float("-inf")
    except (ValueError, TypeError, AttributeError):
        return float("-inf")


def valid_positions(rows, previous=None):
    """Não retrocede nem desloca para salto isolado; não inventa coordenadas."""
    accepted, rejected, seen = [], [], set()
    last = previous
    pending = None
    for p in sorted(rows, key=lambda r: (stamp(r.get('observado_em')), stamp(r.get('calculado_em')))):
        event = p.get('evento_id')
        when = stamp(p.get('observado_em'))
        if (not event or event in seen or not math.isfinite(when)
                or when > time.time()+5 or any(not isinstance(p.get(k), (float,int))
                or not math.isfinite(p[k]) for k in ('x_m','y_m'))
                or not isinstance(p.get('receptores_utilizados'),int) or p['receptores_utilizados'] < 3
                or not isinstance(p.get('erro_residual_m'),(float,int))
                or not math.isfinite(p['erro_residual_m']) or p['erro_residual_m'] < 0):
            rejected.append({'evento_id':event,'motivo':'invalido_ou_duplicado'})
            continue
        seen.add(event)
        if last:
            delta = when-stamp(last.get('observado_em'))
            if delta <= 0:
                continue
            if math.hypot(p['x_m']-last['x_m'], p['y_m']-last['y_m']) > 4*delta+20:
                if pending and math.hypot(p['x_m']-pending['x_m'],p['y_m']-pending['y_m']) <= 4*(when-stamp(pending['observado_em']))+20:
                    accepted.extend([pending,p])
                    last = p
                    pending = None
                    continue
                rejected.append({'evento_id':event,'motivo':'salto_aguardando_confirmacao'})
                pending = p
                continue
        accepted.append(p)
        last = p
        pending = None
    return accepted, rejected


def build_snapshot(db):
    db.progress and db.progress('Consultando snapshot e fila')
    try:
        response = db.session.post(URL + '/rest/v1/rpc/argos_monitor_snapshot', json={
            'p_propriedade':PROPERTY_ID, 'p_transmissor':PREFERRED_TX or None,
            'p_referencia':REFERENCE_VERSION or None, 'p_calibracao':CALIBRATION_HASH or None,
        }, timeout=(2.5,5))
        response.raise_for_status()
        result = response.json()
        if not isinstance(result,dict):
            raise ValueError('snapshot_invalido')
    except requests.RequestException:
        raise RuntimeError('Consulta indisponível; reconexão automática. Confira rede e migration argos_demo_v2.') from None
    trail, rejected = valid_positions(result.get('trilha',[]))
    result['trilha'], result['rejeitados'] = trail, rejected
    result['posicao'] = trail[-1] if trail else None
    result['evento_posicao'] = result['posicao']['evento_id'] if trail else None
    coords = [{k:r[k] for k in ('receptor_id','propriedade_id','x_m','y_m','rssi_1m_dbm','expoente_perda')}
              for r in result.get('receptores',[])]
    actual = hashlib.sha256(json.dumps(sorted(coords,key=lambda r:r['receptor_id']),sort_keys=True,
        separators=(',',':'),allow_nan=False).encode()).hexdigest()
    result['calibracao_compativel'] = not CALIBRATION_HASH or actual == CALIBRATION_HASH
    result['dados_evento'] = sum(r.get('evento_id') == result.get('evento_rssi') for r in result.get('receptores',[]))
    measured = [r.get('medido_em') for r in result.get('receptores',[]) if math.isfinite(stamp(r.get('medido_em')))]
    if measured:
        result['ultima_medicao_em'] = max(measured,key=stamp)
    return result


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
        self.sequence = 0

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
                    old = self.snapshot.get('posicao') if self.snapshot else None
                    if old and snapshot.get('transmissor') == self.snapshot.get('transmissor'):
                        fresh, rejected = valid_positions(snapshot['trilha'], old)
                        snapshot['posicao'] = fresh[-1] if fresh else old
                        snapshot['trilha'] = (self.snapshot.get('trilha',[]) + fresh)[-90:]
                        snapshot['rejeitados'].extend(rejected)
                    self.sequence += 1
                    snapshot['sequencia'] = self.sequence
                    snapshot['consulta_ms'] = round((time.monotonic()-self.started)*1000,2)
                    snapshot['evento_posicao'] = (snapshot.get('posicao') or {}).get('evento_id')
                    self.snapshot = snapshot
                    print('[monitor] ' + json.dumps({k:snapshot.get(k) for k in
                        ('sequencia','evento_rssi','evento_posicao','consulta_ms','fila','calibracao_compativel')},ensure_ascii=False))
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
                    "server_time": utc_now(),
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
    server_version = "ArgosMonitor/2.0"
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
        elif path in ('/monitor.js','/monitor.css','/lucide.js','/outfit.woff2'):
            mime = 'text/javascript' if path.endswith('.js') else 'text/css' if path.endswith('.css') else 'font/woff2'
            self.respond(200, (HERE / path[1:]).read_bytes(), mime)
        elif path == '/api/demo':
            artifact = ROOT / 'ml/model/artifacts/posicao-demo-v2/replay.json'
            if artifact.is_file():
                try:
                    body = artifact.read_bytes()
                    hashes = json.loads((artifact.parent/'hashes.json').read_text())
                    if hashlib.sha256(body).hexdigest() != hashes['replay.json']:
                        raise ValueError('integridade')
                    self.respond(200, body, 'application/json')
                except (ValueError,KeyError,OSError):
                    self.json_response(503, {'erro':'Replay sem integridade válida. Execute evaluate novamente.'})
            else:
                self.json_response(503, {'erro':'Treine a GRU v2 e execute evaluate para preparar o replay.'})
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
    print(" ARGOS | MONITOR REAL E GRU SYNTHETIC | v2.0")
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
