export const NOME_DO_APP = "Argos é o nome do sistema";

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
