import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeteccaoMqtt } from './contract.js';
import type { DetecaoPersistida, DispositivoIoT, RepositorioDeteccoes, VinculoIoT } from './processor.js';

export class SupabaseRepositorioDeteccoes implements RepositorioDeteccoes {
  constructor(private readonly db: SupabaseClient) {}

  async registrarRejeicao(evento: DeteccaoMqtt, motivo: string): Promise<void> {
    const receptor = await this.buscarDispositivo(evento.propriedadeId, evento.receptorId);
    if (!receptor || receptor.tipo !== 'receptor') return;
    const { error } = await this.db.from('alertas').upsert({
      propriedade_id: evento.propriedadeId, dispositivo_id: evento.receptorId,
      origem_evento: evento.receptorId + ':' + evento.eventoId,
      tipo: 'deteccao_rejeitada', titulo: 'Detecção rejeitada por cadastro incompatível',
      descricao: motivo, prioridade: 'media',
    }, { onConflict: 'propriedade_id,origem_evento', ignoreDuplicates: true });
    if (error) throw error;
  }

  async buscarDispositivo(propriedadeId: string, id: string): Promise<DispositivoIoT | null> {
    const { data, error } = await this.db.from('dispositivos')
      .select('id,tipo,status')
      .eq('id', id).eq('propriedade_id', propriedadeId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async buscarZonaAtiva(propriedadeId: string, receptorId: string, instante: string): Promise<{ id: string } | null> {
    const { data, error } = await this.db.from('zonas')
      .select('id')
      .eq('propriedade_id', propriedadeId).eq('receptor_id', receptorId)
      .eq('ativa', true).lte('updated_at', instante).maybeSingle();
    if (error) throw error;
    return data;
  }

  async buscarVinculoNoInstante(
    propriedadeId: string, transmissorId: string, data: string,
  ): Promise<VinculoIoT | null> {
    const { data: vinculo, error } = await this.db.from('vinculos')
      .select('id,inicio_em,fim_em')
      .eq('propriedade_id', propriedadeId).eq('transmissor_id', transmissorId)
      .lte('inicio_em', data)
      .order('inicio_em', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return vinculo;
  }

  async inserirSeInedita(row: DetecaoPersistida): Promise<boolean> {
    // UNIQUE (receptor_id, evento_id) já existe na migração inicial.
    // INSERT ... ON CONFLICT DO NOTHING: protege contra redelivery QoS1,
    // reinícios do processo, replays e requisições simultâneas.
    const { data, error } = await this.db.from('deteccoes')
      .upsert(row, {
        onConflict: 'receptor_id,evento_id',
        ignoreDuplicates: true,
      }).select('id').maybeSingle();
    if (error) throw error;
    return data !== null;
  }

  async atualizarUltimaComunicacao(
    propriedadeId: string, dispositivoId: string, em: string,
  ): Promise<void> {
    // Nunca recuar a marca de tempo caso um evento concorrente termine depois.
    const { error } = await this.db.from('dispositivos')
      .update({ ultima_comunicacao_em: em })
      .eq('id', dispositivoId).eq('propriedade_id', propriedadeId)
      .or(`ultima_comunicacao_em.is.null,ultima_comunicacao_em.lt.${em}`);
    if (error) throw error;
  }
}
