"""PostgREST, escopo obrigatório por propriedade, sem DDL e sem segredos em erros."""
import os
from uuid import UUID
import requests


class DatabaseError(RuntimeError):
    pass


class Database:
    def __init__(self, url, key, property_id, session=None):
        self.property_id = str(UUID(property_id))
        if not url.startswith('https://') or not key:
            raise ValueError('Configure URL HTTPS e chave de backend')
        self.url = url.rstrip('/') + '/rest/v1/'
        self.session = session or requests.Session()
        self.headers = {'apikey': key, 'Authorization': 'Bearer ' + key}

    @classmethod
    def environment(cls):
        return cls(os.environ['SUPABASE_URL'], os.getenv('SUPABASE_SECRET_KEY') or os.environ['SUPABASE_SERVICE_ROLE_KEY'], os.environ['ARGOS_PROPERTY_ID'])

    def request(self, method, table, params=None, body=None, prefer=None):
        params = {**(params or {}), 'propriedade_id': 'eq.' + self.property_id}
        headers = {**self.headers, **({'Prefer': prefer} if prefer else {})}
        try:
            response = self.session.request(method, self.url + table, params=params,
                                            json=body, headers=headers, timeout=(5, 20))
        except requests.RequestException:
            raise DatabaseError('supabase_rede_indisponivel') from None
        if not response.ok:
            raise DatabaseError(f'supabase_http_{response.status_code}')
        return response.json() if response.content else []

    def rows(self, table, **params):
        # Paginação determinística. O limite por página também funciona com cap do servidor.
        out, offset = [], 0
        while True:
            batch = self.request('GET', table, {'select': '*', 'order': 'id', **params, 'limit': 500, 'offset': offset})
            out.extend(batch)
            if not batch:
                return out
            offset += len(batch)

    def upsert(self, table, row, conflict):
        if row['propriedade_id'] != self.property_id:
            raise ValueError('propriedade_incompativel')
        self.request('POST', table, {'on_conflict': conflict}, row, 'resolution=merge-duplicates,return=minimal')

    def jobs(self, now):
        return self.request('GET', 'argos_iot_jobs', {'select': '*', 'estado': 'eq.pendente',
            'disponivel_em': 'lte.' + now, 'order': 'disponivel_em,transmissor_id,evento_id', 'limit': 50})

    def finish_job(self, job, changes):
        # Compare-and-set: leitura tardia aciona trigger e não pode ser escondida pelo ACK.
        return self.request('PATCH', 'argos_iot_jobs', {
            'transmissor_id': 'eq.' + job['transmissor_id'], 'evento_id': 'eq.' + job['evento_id'],
            'atualizado_em': 'eq.' + job['atualizado_em']}, changes, 'return=representation')
