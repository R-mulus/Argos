export const NOME_DO_APP = "Argos é o nome do sistema";

export interface PosicaoAnimal {
  animal_id: string;
  identificacao: string;
  ultima_deteccao_em: string | null;
  instante_posicao: string | null;
  zona_id: string | null;
  zona_nome: string | null;
  receptor_id: string | null;
  rssi_dbm: number | null;
  estado: 'recente' | 'desatualizado' | 'sem_horario' | 'nunca_detectado';
}

export interface ResumoMonitoramento {
  atualizado_em: string;
  total_ativos: number;
  recentes: number;
  recentes_sem_zona: number;
  desatualizados: number;
  sem_horario: number;
  nunca_detectados: number;
  animais: PosicaoAnimal[];
  zonas: { id: string; nome: string; quantidade: number }[];
}

export interface DeteccaoHistorico {
  id: string;
  propriedade_id: string;
  evento_id: string;
  transmissor_id: string;
  receptor_id: string;
  receptor_codigo: string;
  zona_id: string | null;
  zona_nome: string | null;
  vinculo_id: string | null;
  animal_id: string | null;
  animal_identificacao: string | null;
  animal_sexo: 'macho' | 'femea' | null;
  rssi_dbm: number;
  bateria_percentual: number | null;
  detectado_em: string | null;
  recebido_no_gateway_em: string | null;
  recebido_em: string;
  instante_referencia: string | null;
}
