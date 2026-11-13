import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { DeteccaoMqtt } from './contract.js';

export interface LoteSincronizado {
  id: string;
  propriedade: string;
  inicio: string;
  conclusao: string;
  sincronizadas: number;
  rejeitadas: number;
}

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
      CREATE TABLE IF NOT EXISTS lotes (
        id TEXT PRIMARY KEY, propriedade TEXT NOT NULL, inicio TEXT NOT NULL,
        conclusao TEXT, avisado INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX IF NOT EXISTS lote_aberto ON lotes (propriedade) WHERE conclusao IS NULL;
      CREATE TABLE IF NOT EXISTS membros_lote (
        receptor TEXT NOT NULL, evento TEXT NOT NULL, lote TEXT NOT NULL,
        PRIMARY KEY (receptor, evento)
      );
    `);
  }

  guardar(evento: DeteccaoMqtt): boolean {
    // Um INSERT em autocommit só retorna após a gravação durável.
    let nova = false;
    this.transacao(() => {
      const resultado = this.db.prepare(`
      INSERT INTO fila (receptor, evento, dados) VALUES (?, ?, ?)
      ON CONFLICT (receptor, evento) DO NOTHING
    `).run(evento.receptorId, evento.eventoId, JSON.stringify(evento));
      nova = resultado.changes === 1;
      if (nova) this.associarPendentes(evento.propriedadeId);
    });
    return nova;
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

  private transacao(operacao: () => void) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      operacao();
      this.db.exec('COMMIT');
    } catch (erro) {
      this.db.exec('ROLLBACK');
      throw erro;
    }
  }

  private associarPendentes(propriedade: string) {
    this.db.prepare(`
      INSERT OR IGNORE INTO membros_lote (receptor, evento, lote)
      SELECT f.receptor, f.evento, l.id FROM fila f JOIN lotes l
        ON l.propriedade = ? AND l.conclusao IS NULL
      WHERE f.estado = 'pendente' AND json_extract(f.dados, '$.propriedadeId') = l.propriedade
    `).run(propriedade);
  }

  registrarInterrupcao(evento: DeteccaoMqtt) {
    this.transacao(() => {
      this.db.prepare(`
        INSERT OR IGNORE INTO lotes (id, propriedade, inicio) VALUES (?, ?, ?)
      `).run(randomUUID(), evento.propriedadeId, new Date().toISOString());
      this.associarPendentes(evento.propriedadeId);
    });
  }

  avisosPendentes(): LoteSincronizado[] {
    this.db.prepare(`
      UPDATE lotes SET conclusao = ? WHERE conclusao IS NULL AND NOT EXISTS (
        SELECT 1 FROM membros_lote m JOIN fila f
        ON f.receptor = m.receptor AND f.evento = m.evento
        WHERE m.lote = lotes.id AND f.estado = 'pendente'
      )
    `).run(new Date().toISOString());
    return this.db.prepare(`
      SELECT l.id, l.propriedade, l.inicio, l.conclusao,
        sum(f.estado = 'sincronizada') AS sincronizadas, sum(f.estado = 'rejeitada') AS rejeitadas
      FROM lotes l JOIN membros_lote m ON m.lote = l.id
      JOIN fila f ON f.receptor = m.receptor AND f.evento = m.evento
      WHERE l.conclusao IS NOT NULL AND l.avisado = 0 GROUP BY l.id
    `).all().map(row => ({
      id: String(row.id), propriedade: String(row.propriedade), inicio: String(row.inicio),
      conclusao: String(row.conclusao), sincronizadas: Number(row.sincronizadas),
      rejeitadas: Number(row.rejeitadas),
    }));
  }

  confirmarAviso(id: string) {
    this.db.prepare('UPDATE lotes SET avisado = 1 WHERE id = ?').run(id);
  }

  resumo(): string {
    const linhas = this.db.prepare('SELECT estado, count(*) AS total FROM fila GROUP BY estado').all();
    const totais = new Map(linhas.map(row => [row.estado, row.total]));
    return `Pendentes: ${totais.get('pendente') ?? 0}, sincronizadas: ${totais.get('sincronizada') ?? 0}, rejeitadas: ${totais.get('rejeitada') ?? 0}.`;
  }

  fechar() { this.db.close(); }
}
