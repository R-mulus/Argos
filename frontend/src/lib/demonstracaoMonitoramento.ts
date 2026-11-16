import type { Alerta, ComunicacaoReceptor, DeteccaoHistorico, PosicaoAnimal, ResumoMonitoramento } from "@argos/shared";
import type { AnimalCadastro, EstadoAlerta, FiltroHistorico, FonteMonitoramento, Pagina, ZonaCadastro } from "@/lib/fonteMonitoramento";

/**
 * Fixtures exclusivas das prévias públicas `#/demonstracao/inicio` e `#/demonstracao/animais`.
 * Nunca substituem respostas ou erros da API na rota autenticada.
 */
export type CenarioDemonstracao = "preenchido" | "vazio" | "erro" | "carregando" | "desatualizado";

const nomesZonas = ["Curral 03", "Bebedouro", "Curral 01", "Quintal da casa"];
const quantidades = [36, 18, 12, 6];
const estadosReceptores: ComunicacaoReceptor["estado_comunicacao"][] = ["recente", "recente", "sem_leitura_recente", "aguardando_primeira_leitura"];

function pagina<T>(data: T[]): Pagina<T> {
	return { data, count: data.length, limit: 100, offset: 0 };
}

export function resumoDemonstracao(vazio: boolean): ResumoMonitoramento {
	const agora = Date.now();
	const animais: PosicaoAnimal[] = [];
	const adicionar = (estado: PosicaoAnimal["estado"], zona: number | null, minutosAtras: number | null) => {
		const n = animais.length;
		const instante = minutosAtras === null ? null : new Date(agora - minutosAtras * 60_000).toISOString();
		animais.push({
			animal_id: `animal-${n}`,
			identificacao: `ARG-${String(123 + n).padStart(4, "0")}`,
			ultima_deteccao_em: instante,
			instante_posicao: instante,
			zona_id: zona === null ? null : `zona-${zona}`,
			zona_nome: zona === null ? null : nomesZonas[zona],
			receptor_id: zona === null ? null : `receptor-${zona}`,
			rssi_dbm: zona === null ? null : -60,
			estado,
		});
	};
	if (!vazio) {
		quantidades.forEach((quantidade, zona) => { for (let i = 0; i < quantidade; i++) adicionar("recente", zona, 1 + (i % 4)); });
		adicionar("recente", null, 2);
		adicionar("recente", null, 3);
		for (let i = 0; i < 3; i++) adicionar("desatualizado", i, 40 + i);
		adicionar("sem_horario", null, null);
		adicionar("nunca_detectado", null, null);
		adicionar("nunca_detectado", null, null);
	}
	const contar = (estado: PosicaoAnimal["estado"]) => animais.filter(a => a.estado === estado).length;
	return {
		atualizado_em: new Date(agora).toISOString(),
		total_ativos: animais.length,
		recentes: contar("recente"),
		recentes_sem_zona: animais.filter(a => a.estado === "recente" && !a.zona_id).length,
		desatualizados: contar("desatualizado"),
		sem_horario: contar("sem_horario"),
		nunca_detectados: contar("nunca_detectado"),
		animais,
		zonas: vazio ? [] : nomesZonas.map((nome, i) => ({ id: `zona-${i}`, nome, quantidade: quantidades[i] })),
	};
}

export const receptoresDemonstracao: ComunicacaoReceptor[] = estadosReceptores.map((estado, i) => ({
	id: `receptor-${i}`,
	codigo: `R0${i + 1}-3XPQ${i + 2}`,
	nome: `R0${i + 1} - ${nomesZonas[i]}`,
	status: "ativo",
	estado_comunicacao: estado,
	ultima_comunicacao_em: estado === "aguardando_primeira_leitura" ? null : new Date(Date.now() - (estado === "recente" ? 60_000 : 3_600_000)).toISOString(),
}));

// Receptores reservas, sem zona: exercitam a paginação e a lista de cards pequenos.
receptoresDemonstracao.push(...[5, 6].map((n): ComunicacaoReceptor => ({
	id: `receptor-${n - 1}`, codigo: `R0${n}-RESERVA`, nome: `R0${n} - Reserva`, status: "ativo",
	estado_comunicacao: "aguardando_primeira_leitura", ultima_comunicacao_em: null,
})));

const zonasDemonstracao: ZonaCadastro[] = nomesZonas.map((nome, i) => ({ id: `zona-${i}`, nome, receptor_id: `receptor-${i}`, ativa: true }));

const animalDemonstracao = (id: string): AnimalCadastro => ({
	id,
	identificacao: "ARG-0123",
	sexo: "femea",
	raca: "Nelore",
	data_nascimento: new Date(Date.now() - 3 * 365.25 * 86_400_000).toISOString().slice(0, 10),
});

function leituraDemonstracao(zonaId: string): DeteccaoHistorico {
	const agora = new Date().toISOString();
	return {
		id: `leitura-${zonaId}`, propriedade_id: "propriedade-demo", evento_id: "demo:1", transmissor_id: "coleira-demo",
		receptor_id: zonaId.replace("zona", "receptor"), receptor_codigo: "R01", zona_id: zonaId, zona_nome: null,
		vinculo_id: null, animal_id: "animal-0", animal_identificacao: "ARG-0123", animal_sexo: "femea",
		rssi_dbm: zonaId === "zona-0" ? -60 : -72, bateria_percentual: null,
		detectado_em: agora, recebido_no_gateway_em: agora, recebido_em: agora, instante_referencia: agora,
	};
}

/** Uma leitura simulada a cada 4 minutos na zona, com uma lacuna de 16 minutos a cada 90 leituras. */
function historicoDemonstracao({ zonaId, inicio, fim }: FiltroHistorico): DeteccaoHistorico[] {
	const passo = 4 * 60_000;
	const zona = Number(zonaId.replace("zona-", "")) || 0;
	// Coerente com os estados dos receptores simulados: R03 parou há 1 h e R04 nunca leu.
	if (zona === 3) return [];
	const ultimo = Math.min(Date.parse(fim) - 1, Date.now() - (zona === 2 ? 3_600_000 : 0));
	const linhas: DeteccaoHistorico[] = [];
	for (let t = ultimo - (ultimo % passo), i = 0; t >= Date.parse(inicio); t -= passo * (i % 90 === 89 ? 4 : 1), i++) {
		const animal = (i * 7 + zona) % 12;
		const instante = new Date(t).toISOString();
		linhas.push({
			...leituraDemonstracao(zonaId),
			id: `${zona}${(t / 60_000).toString(16)}`,
			evento_id: `demo:${t}`,
			receptor_codigo: `R0${zona + 1}`,
			zona_nome: nomesZonas[zona] ?? null,
			animal_id: `animal-${animal}`,
			animal_identificacao: `ARG-${String(123 + animal).padStart(4, "0")}`,
			animal_sexo: animal % 2 ? "macho" : "femea",
			rssi_dbm: -55 - ((i * 3) % 30),
			bateria_percentual: 40 + ((i * 7) % 58),
			detectado_em: instante, recebido_no_gateway_em: instante, recebido_em: instante, instante_referencia: instante,
		});
	}
	return linhas;
}

// Avisos simulados da central; as ações da prévia alteram esta lista em memória.
const modelosAlerta: [Alerta["tipo"], string, string | null, Alerta["prioridade"], EstadoAlerta, number][] = [
	["demonstracao", "Coleira do ARG-0123 com bateria baixa (simulado).", "Bateria informada pela coleira abaixo de 15%.", "alta", "novo", 15],
	["deteccao_rejeitada", "Leitura rejeitada: coleira sem vínculo ativo", "O receptor R02 enviou uma leitura de uma coleira que não está vinculada a nenhum animal.", "media", "novo", 42],
	["sincronizacao_concluida", "Sincronização concluída após interrupção", "Interrupção observada às 07:12. 38 detecções confirmadas e 0 rejeitadas após a recuperação.", "baixa", "novo", 95],
	["deteccao_rejeitada", "Leitura rejeitada: receptor inativo", "O receptor R05 está inativo no cadastro e enviou 3 leituras.", "critica", "novo", 130],
	["demonstracao", "ARG-0127 sem detecção há mais de 40 minutos (simulado).", "Última posição: Curral 01.", "media", "lido", 260],
	["sincronizacao_concluida", "Sincronização concluída após interrupção", "Interrupção observada às 02:40. 112 detecções confirmadas e 2 rejeitadas.", "baixa", "lido", 480],
	["deteccao_rejeitada", "Leitura rejeitada: evento duplicado com conteúdo diferente", null, "alta", "resolvido", 1500],
	["demonstracao", "Receptor R03 sem leituras recentes (simulado).", "Confira se o receptor está ligado e se há coleiras por perto.", "media", "resolvido", 2900],
];

function criarAlertas(): Alerta[] {
	return Array.from({ length: 3 }, (_, rodada) => modelosAlerta.map(([tipo, titulo, descricao, prioridade, estado, minutos], i): Alerta => {
		const criado = Date.now() - (minutos + rodada * 4320) * 60_000;
		return {
			id: `alerta-${rodada}-${i}`, propriedade_id: "propriedade-demo", animal_id: i === 0 ? "animal-0" : null, dispositivo_id: null,
			tipo, titulo, descricao, prioridade, estado: rodada === 0 ? estado : estado === "novo" ? "lido" : estado,
			criado_em: new Date(criado).toISOString(),
			lido_em: estado === "novo" && rodada === 0 ? null : new Date(criado + 600_000).toISOString(),
			resolvido_em: estado === "resolvido" ? new Date(criado + 1_800_000).toISOString() : null,
			origem_evento: null,
		};
	})).flat().sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em));
}

/** Consultas simuladas com a mesma interface da API. */
export function fonteDemonstracao(cenario: CenarioDemonstracao): FonteMonitoramento {
	const vazio = cenario === "vazio";
	const avisos = vazio ? [] : criarAlertas();
	const responder = <T,>(valor: () => T): Promise<T> => {
		if (cenario === "carregando") return new Promise<T>(() => {});
		if (cenario === "erro" || cenario === "desatualizado") return Promise.reject(new Error("Falha simulada de conexão com a API."));
		return Promise.resolve(valor());
	};
	return {
		resumo: () => responder(() => resumoDemonstracao(vazio)),
		receptores: () => responder(() => pagina(vazio ? [] : receptoresDemonstracao)),
		zonas: () => responder(() => pagina(vazio ? [] : zonasDemonstracao)),
		contarLeituras: (inicio, fim) => responder(() => vazio ? 0 : Math.round(25 * (Date.parse(fim) - Date.parse(inicio)) / 86_400_000)),
		animal: id => responder(() => animalDemonstracao(id)),
		ultimaPesagem: () => responder(() => ({ data_pesagem: new Date().toISOString().slice(0, 10), peso_kg: 520 })),
		ultimaLeituraZona: zonaId => responder(() => leituraDemonstracao(zonaId)),
		alertasNovos: () => responder(() => pagina(avisos.filter(a => a.estado === "novo"))),
		historico: (filtro, offset) => responder(() => {
			const linhas = vazio ? [] : historicoDemonstracao(filtro);
			return { data: linhas.slice(offset, offset + 100), count: linhas.length, limit: 100, offset };
		}),
		exportarHistorico: filtro => responder(() => {
			const linhas = historicoDemonstracao(filtro).map(l => [l.instante_referencia, l.zona_nome, l.animal_identificacao, l.receptor_codigo, l.rssi_dbm].join(";"));
			return new Blob([`\uFEFFinstante;zona;animal;receptor;rssi_dbm\r\n${linhas.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
		}),
		alertas: (estado, offset, limite) => responder(() => {
			const filtrados = avisos.filter(a => !estado || a.estado === estado);
			return { data: filtrados.slice(offset, offset + limite).map(a => ({ ...a })), count: filtrados.length, limit: limite, offset };
		}),
		atualizarAlerta: (id, estado) => responder(() => {
			const aviso = avisos.find(a => a.id === id);
			if (!aviso) throw new Error("Aviso não encontrado.");
			// Mesmas regras da API: resolvido não volta a lido e resolver também preenche a leitura.
			const agora = new Date().toISOString();
			aviso.lido_em ??= agora;
			if (estado === "resolvido") { aviso.estado = "resolvido"; aviso.resolvido_em ??= agora; }
			else if (aviso.estado !== "resolvido") aviso.estado = "lido";
			return { ...aviso };
		}),
	};
}

/** Dados antigos já em cache, usados para exibir o estado "desatualizado" na prévia. */
export const cacheDesatualizado = {
	resumo: () => resumoDemonstracao(false),
	receptores: () => pagina(receptoresDemonstracao),
	zonas: () => pagina(zonasDemonstracao),
};
