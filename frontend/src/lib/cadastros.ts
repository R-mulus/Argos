import { ErroApi, consultarApi, enviarApi } from "@/lib/sessao";
import type { HistoricoPesagens, Pesagem } from "@argos/shared";
import type { Pagina } from "@/lib/fonteMonitoramento";

/** Registros retornados pelas rotas de cadastro (`select *` no backend), com os campos usados nas telas. */
export type Dispositivo = {
	id: string;
	codigo: string;
	nome: string | null;
	tipo: "transmissor" | "receptor";
	status: "ativo" | "inativo";
	identificador_hardware: string | null;
	versao_firmware: string | null;
	ultima_comunicacao_em: string | null;
};
export type DispositivoNovo = Pick<Dispositivo, "codigo" | "tipo" | "nome" | "status" | "identificador_hardware" | "versao_firmware">;
export type DispositivoEdicao = Omit<DispositivoNovo, "tipo">;

export type Zona = { id: string; nome: string; descricao: string | null; receptor_id: string | null; ativa: boolean };
export type ZonaDados = Omit<Zona, "id">;

export type Animal = {
	id: string;
	identificacao: string;
	sexo: "macho" | "femea" | null;
	categoria: string | null;
	raca: string | null;
	data_nascimento: string | null;
	origem: string | null;
	lote: string | null;
	observacoes: string | null;
	status: "ativo" | "inativo";
};
export type AnimalDados = Omit<Animal, "id">;
/** Compatibilidade com as abas que só precisam de identificação e status. */
export type AnimalResumo = Pick<Animal, "id" | "identificacao" | "status">;

export type Vinculo = { id: string; animal_id: string; transmissor_id: string; inicio_em: string; fim_em: string | null };

export type Propriedade = { id: string; nome: string; municipio: string | null; uf: string | null; created_at: string };
export type PropriedadeDados = Pick<Propriedade, "nome" | "municipio" | "uf">;

/** Operações de cadastro; a prévia pública usa a mesma interface com dados em memória. */
export interface FonteCadastros {
	/** `null` quando o usuário ainda não cadastrou a propriedade (404 da API). */
	propriedade(signal: AbortSignal): Promise<Propriedade | null>;
	criarPropriedade(dados: PropriedadeDados): Promise<Propriedade>;
	editarPropriedade(dados: Partial<PropriedadeDados>): Promise<Propriedade>;
	dispositivos(signal: AbortSignal): Promise<Dispositivo[]>;
	criarDispositivo(dados: DispositivoNovo): Promise<Dispositivo>;
	editarDispositivo(id: string, dados: Partial<DispositivoEdicao>): Promise<Dispositivo>;
	zonas(signal: AbortSignal): Promise<Zona[]>;
	criarZona(dados: ZonaDados): Promise<Zona>;
	editarZona(id: string, dados: Partial<ZonaDados>): Promise<Zona>;
	animais(signal: AbortSignal): Promise<Animal[]>;
	criarAnimal(dados: AnimalDados): Promise<Animal>;
	editarAnimal(id: string, dados: Partial<AnimalDados>): Promise<Animal>;
	/** Até 100 pesagens, da mais recente à mais antiga, com o ganho médio diário de todo o histórico. */
	pesagens(animalId: string, signal: AbortSignal): Promise<HistoricoPesagens>;
	/** Uma pesagem por animal por dia (409 se repetir a data). */
	registrarPesagem(animalId: string, pesagem: Pesagem): Promise<Pesagem>;
	vinculos(signal: AbortSignal): Promise<Vinculo[]>;
	criarVinculo(animalId: string, transmissorId: string): Promise<Vinculo>;
	encerrarVinculo(id: string): Promise<Vinculo>;
}

/** Percorre a paginação (máximo de 100 por página) até trazer todos os registros. */
async function listarTodos<T>(caminho: string, signal: AbortSignal): Promise<T[]> {
	const itens: T[] = [];
	for (let offset = 0; ; offset += 100) {
		const separador = caminho.includes("?") ? "&" : "?";
		const pagina = await consultarApi<Pagina<T>>(`${caminho}${separador}limit=100&offset=${offset}`, signal);
		itens.push(...pagina.data);
		if (!pagina.data.length || itens.length >= pagina.count) return itens;
	}
}

const id = (valor: string) => encodeURIComponent(valor);
const dados = async <T,>(promessa: Promise<{ data: T }>) => (await promessa).data;

export const cadastrosApi: FonteCadastros = {
	propriedade: async signal => {
		try {
			return (await consultarApi<{ data: Propriedade }>("/propriedades/minha", signal)).data;
		} catch (erro) {
			if (erro instanceof ErroApi && erro.status === 404) return null;
			throw erro;
		}
	},
	criarPropriedade: corpo => dados(enviarApi("/propriedades", "POST", corpo)),
	editarPropriedade: corpo => dados(enviarApi("/propriedades/minha", "PATCH", corpo)),
	dispositivos: signal => listarTodos<Dispositivo>("/dispositivos", signal),
	criarDispositivo: corpo => dados(enviarApi("/dispositivos", "POST", corpo)),
	editarDispositivo: (dispositivo, corpo) => dados(enviarApi(`/dispositivos/${id(dispositivo)}`, "PATCH", corpo)),
	zonas: signal => listarTodos<Zona>("/zonas", signal),
	criarZona: corpo => dados(enviarApi("/zonas", "POST", corpo)),
	editarZona: (zona, corpo) => dados(enviarApi(`/zonas/${id(zona)}`, "PATCH", corpo)),
	animais: signal => listarTodos<Animal>("/animais", signal),
	criarAnimal: corpo => dados(enviarApi("/animais", "POST", corpo)),
	editarAnimal: (animal, corpo) => dados(enviarApi(`/animais/${id(animal)}`, "PATCH", corpo)),
	pesagens: (animal, signal) => consultarApi<HistoricoPesagens>(`/animais/${id(animal)}/pesagens?limit=100&offset=0`, signal),
	registrarPesagem: (animal, corpo) => dados(enviarApi(`/animais/${id(animal)}/pesagens`, "POST", corpo)),
	vinculos: signal => listarTodos<Vinculo>("/vinculos", signal),
	criarVinculo: (animal_id, transmissor_id) => dados(enviarApi("/vinculos", "POST", { animal_id, transmissor_id })),
	encerrarVinculo: vinculo => dados(enviarApi(`/vinculos/${id(vinculo)}/encerrar`, "PATCH", {})),
};

/** Cadastros simulados da prévia `#/demonstracao/configuracoes`, com as mesmas regras de unicidade da API. */
export function cadastrosDemonstracao(vazio = false): FonteCadastros {
	const agora = Date.now();
	let propriedade: Propriedade | null = vazio ? null : { id: "propriedade-demo", nome: "Fazenda Experimental", municipio: "Patos de Minas", uf: "MG", created_at: new Date(agora - 20 * 86_400_000).toISOString() };
	const receptores: Dispositivo[] = vazio ? [] : ["Curral 03", "Bebedouro", "Curral 01", "Quintal da casa"].map((nome, i) => ({
		id: `receptor-${i}`, codigo: `R0${i + 1}`, nome: `Receptor ${nome}`, tipo: "receptor", status: "ativo",
		identificador_hardware: `ESP32-C3-${(0xa1b2 + i).toString(16).toUpperCase()}`, versao_firmware: "1.0.3",
		ultima_comunicacao_em: i < 2 ? new Date(agora - 60_000).toISOString() : null,
	}));
	const coleiras: Dispositivo[] = vazio ? [] : Array.from({ length: 8 }, (_, i) => ({
		id: `coleira-${i}`, codigo: `T${String(i + 1).padStart(2, "0")}`, nome: `Coleira ${String(i + 1).padStart(2, "0")}`, tipo: "transmissor",
		status: i === 7 ? "inativo" : "ativo", identificador_hardware: null, versao_firmware: "1.0.3", ultima_comunicacao_em: null,
	}));
	const dispositivos = [...receptores, ...coleiras];
	const zonas: Zona[] = vazio ? [] : ["Curral 03", "Bebedouro", "Curral 01"].map((nome, i) => ({
		id: `zona-${i}`, nome, descricao: i === 1 ? "Área do bebedouro principal." : null, receptor_id: `receptor-${i}`, ativa: true,
	}));
	const racas = ["Nelore", "Angus", "Girolando", "Nelore"];
	const animais: Animal[] = vazio ? [] : Array.from({ length: 9 }, (_, i) => ({
		id: `animal-${i}`, identificacao: `ARG-${String(123 + i).padStart(4, "0")}`, sexo: i % 3 === 0 ? "macho" : "femea",
		categoria: i % 3 === 0 ? "Novilho" : "Vaca", raca: racas[i % racas.length],
		data_nascimento: new Date(agora - (400 + i * 95) * 86_400_000).toISOString().slice(0, 10),
		origem: i < 6 ? "Nascido na fazenda" : "Leilão regional", lote: `Lote ${1 + (i % 3)}`, observacoes: null, status: i === 8 ? "inativo" : "ativo",
	}));
	// Pesagens semanais simuladas dos primeiros animais.
	const pesagens = new Map<string, Pesagem[]>(animais.slice(0, 4).map((a, i) => [a.id, Array.from({ length: 6 }, (_, s) => ({
		data_pesagem: new Date(agora - s * 7 * 86_400_000).toISOString().slice(0, 10), peso_kg: 480 + i * 15 - s * 4.5,
	}))]));
	const vinculos: Vinculo[] = vazio ? [] : [0, 1, 2, 3, 4].map(i => ({
		id: `vinculo-${i}`, animal_id: `animal-${i}`, transmissor_id: `coleira-${i}`, inicio_em: new Date(agora - (10 - i) * 86_400_000).toISOString(), fim_em: null,
	}));
	vinculos.push(...(vazio ? [] : [{ id: "vinculo-antigo", animal_id: "animal-5", transmissor_id: "coleira-6", inicio_em: new Date(agora - 30 * 86_400_000).toISOString(), fim_em: new Date(agora - 12 * 86_400_000).toISOString() }]));

	let sequencia = 0;
	const novoId = (prefixo: string) => `${prefixo}-novo-${++sequencia}`;
	const resolver = <T,>(acao: () => T) => new Promise<T>((ok, falha) => window.setTimeout(() => { try { ok(acao()); } catch (erro) { falha(erro); } }, 350));
	const copia = <T,>(lista: T[]) => Promise.resolve(lista.map(item => ({ ...item })));
	function conferirCodigo(codigo: string, tipo: Dispositivo["tipo"], ignorar?: string) {
		if (dispositivos.some(d => d.tipo === tipo && d.codigo === codigo && d.id !== ignorar)) throw new Error("Já existe um dispositivo deste tipo com esse código.");
	}
	function conferirZona(dadosZona: Partial<ZonaDados>, ignorar?: string) {
		if (dadosZona.nome && zonas.some(z => z.nome === dadosZona.nome && z.id !== ignorar)) throw new Error("Já existe uma zona com esse nome.");
		if (dadosZona.receptor_id && zonas.some(z => z.receptor_id === dadosZona.receptor_id && z.id !== ignorar)) throw new Error("Este receptor já está atribuído a outra zona.");
	}

	return {
		propriedade: () => Promise.resolve(propriedade && { ...propriedade }),
		criarPropriedade: corpo => resolver(() => {
			if (propriedade) throw new Error("O usuário já possui uma propriedade.");
			propriedade = { ...corpo, id: "propriedade-demo", created_at: new Date().toISOString() };
			return { ...propriedade };
		}),
		editarPropriedade: corpo => resolver(() => {
			if (!propriedade) throw new Error("Propriedade não cadastrada.");
			propriedade = { ...propriedade, ...corpo };
			return { ...propriedade };
		}),
		dispositivos: () => copia(dispositivos),
		criarDispositivo: corpo => resolver(() => {
			conferirCodigo(corpo.codigo, corpo.tipo);
			const novo: Dispositivo = { ...corpo, id: novoId(corpo.tipo), ultima_comunicacao_em: null };
			dispositivos.push(novo);
			return { ...novo };
		}),
		editarDispositivo: (alvo, corpo) => resolver(() => {
			const atual = dispositivos.find(d => d.id === alvo);
			if (!atual) throw new Error("Dispositivo não encontrado.");
			if (corpo.codigo) conferirCodigo(corpo.codigo, atual.tipo, alvo);
			Object.assign(atual, corpo);
			return { ...atual };
		}),
		zonas: () => copia(zonas),
		criarZona: corpo => resolver(() => {
			conferirZona(corpo);
			const nova = { ...corpo, id: novoId("zona") };
			zonas.push(nova);
			return { ...nova };
		}),
		editarZona: (alvo, corpo) => resolver(() => {
			const atual = zonas.find(z => z.id === alvo);
			if (!atual) throw new Error("Zona não encontrada.");
			conferirZona(corpo, alvo);
			const resultado = { ...atual, ...corpo };
			if (resultado.ativa && !resultado.receptor_id) throw new Error("Uma zona ativa precisa de um receptor.");
			Object.assign(atual, corpo);
			return { ...atual };
		}),
		animais: () => copia(animais),
		criarAnimal: corpo => resolver(() => {
			if (animais.some(a => a.identificacao === corpo.identificacao)) throw new Error("Já existe um animal com essa identificação.");
			const novo: Animal = { ...corpo, id: novoId("animal") };
			animais.push(novo);
			return { ...novo };
		}),
		editarAnimal: (alvo, corpo) => resolver(() => {
			const atual = animais.find(a => a.id === alvo);
			if (!atual) throw new Error("Animal não encontrado.");
			if (corpo.identificacao && animais.some(a => a.identificacao === corpo.identificacao && a.id !== alvo)) throw new Error("Já existe um animal com essa identificação.");
			Object.assign(atual, corpo);
			return { ...atual };
		}),
		pesagens: animal => Promise.resolve((() => {
			const lista = [...(pesagens.get(animal) ?? [])].sort((a, b) => b.data_pesagem.localeCompare(a.data_pesagem));
			const [ultima, primeira] = [lista[0], lista[lista.length - 1]];
			const dias = ultima && primeira ? (Date.parse(ultima.data_pesagem) - Date.parse(primeira.data_pesagem)) / 86_400_000 : 0;
			return { data: lista, count: lista.length, limit: 100, offset: 0, ganho_medio_diario_kg: dias > 0 ? Math.round(((ultima.peso_kg - primeira.peso_kg) / dias) * 1000) / 1000 : null };
		})()),
		registrarPesagem: (animal, corpo) => resolver(() => {
			const lista = pesagens.get(animal) ?? [];
			if (lista.some(p => p.data_pesagem === corpo.data_pesagem)) throw new Error("O animal já tem uma pesagem nesta data.");
			lista.push({ ...corpo });
			pesagens.set(animal, lista);
			return { ...corpo };
		}),
		vinculos: () => copia(vinculos),
		criarVinculo: (animal_id, transmissor_id) => resolver(() => {
			if (vinculos.some(v => !v.fim_em && (v.animal_id === animal_id || v.transmissor_id === transmissor_id))) throw new Error("O animal ou a coleira já tem um vínculo ativo.");
			const novo: Vinculo = { id: novoId("vinculo"), animal_id, transmissor_id, inicio_em: new Date().toISOString(), fim_em: null };
			vinculos.push(novo);
			return { ...novo };
		}),
		encerrarVinculo: alvo => resolver(() => {
			const atual = vinculos.find(v => v.id === alvo);
			if (!atual) throw new Error("Vínculo não encontrado.");
			if (atual.fim_em) throw new Error("Este vínculo já foi encerrado.");
			atual.fim_em = new Date().toISOString();
			return { ...atual };
		}),
	};
}
