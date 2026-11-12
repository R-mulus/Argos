import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DeteccaoMqtt } from './contract.js';

export class FilaDeteccoes {
  private readonly db: DatabaseSync;

  constructor(caminho: string) {
    mkdirSync(dirname(caminho), { recursive: true });
    this.db = new DatabaseSync(caminho);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS fila (
        receptor TEXT NOT NULL,
        evento TEXT NOT NULL,
        dados TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendente',
        PRIMARY KEY (receptor, evento)
      );
      CREATE INDEX IF NOT EXISTS fila_estado ON fila (estado);
    `);
  }

  guardar(evento: DeteccaoMqtt): boolean {
    // Um INSERT em autocommit só retorna após a gravação durável.
    const resultado = this.db.prepare(`
      INSERT INTO fila (receptor, evento, dados) VALUES (?, ?, ?)
      ON CONFLICT (receptor, evento) DO NOTHING
    `).run(evento.receptorId, evento.eventoId, JSON.stringify(evento));
    return resultado.changes === 1;
  }

  pendentes(): DeteccaoMqtt[] {
    return this.db.prepare(`
      SELECT dados FROM fila WHERE estado = 'pendente' ORDER BY rowid LIMIT 50
    `).all().map(row => JSON.parse(String(row.dados)) as DeteccaoMqtt);
  }

  concluir(evento: DeteccaoMqtt, estado: 'sincronizada' | 'rejeitada') {
    this.db.prepare('UPDATE fila SET estado = ? WHERE receptor = ? AND evento = ?')
      .run(estado, evento.receptorId, evento.eventoId);
  }

  resumo(): string {
    const linhas = this.db.prepare('SELECT estado, count(*) AS total FROM fila GROUP BY estado').all();
    const totais = new Map(linhas.map(row => [row.estado, row.total]));
    return `Pendentes: ${totais.get('pendente') ?? 0}, sincronizadas: ${totais.get('sincronizada') ?? 0}, rejeitadas: ${totais.get('rejeitada') ?? 0}.`;
  }

  fechar() { this.db.close(); }
}
