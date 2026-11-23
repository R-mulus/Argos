import { DurableQueue, type Pending } from './queue.js';
import { PermanentError, type DetectionRow, type Log, type Repository } from './types.js';

export class Processor {
  private busy = false;
  constructor(private queue: DurableQueue, private repository: Repository, private log: Log,
    private batchSize = 32, private retryBase = 1000, private retryMax = 60000) {}
  private failed(item: Pending, error: unknown) {
    const reason = error instanceof Error ? error.message : 'erro_desconhecido';
    if (error instanceof PermanentError && this.queue.reject(item.key, reason)) {
      this.log('rejeitada', { key: item.key, reason }); return;
    }
    const delay = Math.min(this.retryMax, this.retryBase * 2 ** Math.min(item.attempts, 16));
    this.queue.retry(item.key, reason, Date.now() + delay + Math.floor(Math.random() * delay * 0.2));
    this.log('reagendada', { key: item.key, reason, attempt: item.attempts + 1 });
  }
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const ready = this.queue.ready(this.batchSize);
      const prepared: { item: Pending; row: DetectionRow }[] = [];
      for (let i = 0; i < ready.length; ++i) {
        const item = ready[i]!;
        try { prepared.push({ item, row: await this.repository.prepare(item.event) }); }
        catch (error) {
          this.failed(item, error);
          if (!(error instanceof PermanentError)) {
            // Banco indisponível: uma falha basta; não disparar dezenas de requisições iguais.
            for (const remaining of ready.slice(i + 1)) this.failed(remaining, error);
            break;
          }
        }
      }
      if (!prepared.length) return;
      try {
        await this.repository.insert(prepared.map(p => p.row));
        this.queue.complete(prepared.map(p => p.item.key));
        this.log('persistidas', { count: prepared.length });
      } catch (error) {
        if (error instanceof PermanentError && prepared.length > 1) {
          // Um registro com FK alterada não bloqueia o lote inteiro.
          for (const { item, row } of prepared) {
            try { await this.repository.insert([row]); this.queue.complete([item.key]); }
            catch (singleError) { this.failed(item, singleError); }
          }
        } else for (const { item } of prepared) this.failed(item, error);
      }
    } finally {
      try {
        if (this.repository.notify) for (const notice of this.queue.notices()) {
          try { await this.repository.notify(notice.value); this.queue.acknowledgeNotice(notice.key); }
          catch { this.log('aviso_preservado_para_retry', { key: notice.key }); }
        }
      } finally { this.busy = false; }
    }
  }
}
