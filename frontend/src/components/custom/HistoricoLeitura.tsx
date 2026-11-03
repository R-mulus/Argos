import { useId, useMemo, useState } from "react";
import {
	createColumnHelper,
	createPaginatedRowModel,
	createSortedRowModel,
	rowPaginationFeature,
	rowSortingFeature,
	sortFn_alphanumeric,
	sortFn_datetime,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import { endOfDay, format, isValid, parseISO, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
	ArrowDown,
	ArrowDownUp,
	ArrowUp,
	ChevronLeft,
	ChevronRight,
	Download,
	FileSpreadsheet,
	FileText,
	ListFilter,
	RotateCcw,
} from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

/** Estrutura apresentada ao frontend após a transformação da resposta da API. */
export type RegistroLeitura = {
	id: string;
	areaId: string;
	nomeArea: string;
	animalId: string;
	/** ISO 8601; a API deve indicar o fuso horário corretamente. */
	dataHora: string;
	categoria: string;
	/** Confiança da classificação de comportamento: de 0 a 100. */
	precisaoPercentual: number | null;
	sexo: "Macho" | "Fêmea" | "Não informado";
	receptor: string;
	rssiDbm: number | null;
	bateriaPercentual: number | null;
};

type HistoricoLeituraProps = {
	dados?: RegistroLeitura[];
	className?: string;
	/** Habilita exportação de dados filtrados e ordenados. Padrão: true. */
	permitirExportacao?: boolean;
};

// Os valores abaixo são fictícios e existem apenas para demonstrar a interface.
export const leiturasSimuladas: RegistroLeitura[] = Array.from({ length: 34 }, (_, indice) => {
	const animalNumero = indice % 6;
	const areaNumero = indice % 3;
	const animais = ["003", "004", "017", "021", "030", "043"];
	const areas = ["Curral 01", "Bebedouro", "Área de descanso"];
	const receptores = ["R01", "R02", "R03"];
	const categorias = ["Movimento", "Alimentação", "Descanso", "Agrupamento"];
	const dia = String(1 + Math.floor(indice / 12)).padStart(2, "0");
	const hora = String(6 + (indice % 12)).padStart(2, "0");
	const minuto = indice % 2 === 0 ? "23" : "53";

	return {
		id: String(indice + 1).padStart(3, "0"),
		areaId: String(areaNumero + 1).padStart(2, "0"),
		nomeArea: areas[areaNumero],
		animalId: animais[animalNumero],
		dataHora: `2025-09-${dia}T${hora}:${minuto}:00`,
		categoria: categorias[indice % categorias.length],
		precisaoPercentual: 95 - (indice % 7),
		sexo: indice % 2 === 0 ? "Macho" : "Fêmea",
		receptor: receptores[areaNumero],
		rssiDbm: -52 - ((indice * 3) % 28),
		bateriaPercentual: 40 + ((indice * 7) % 58),
	};
});

function lerData(dataHora: string): Date | null {
	const data = parseISO(dataHora);
	return isValid(data) ? data : null;
}

function exibirData(dataHora: string, mascara: string) {
	const data = lerData(dataHora);
	return data ? format(data, mascara, { locale: ptBR }) : "—";
}

function formatarPercentual(valor: number | null) {
	return valor == null ? "—" : `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatarRSSI(valor: number | null) {
	return valor == null ? "—" : `${valor} dBm`;
}

// Configuração da API v9 do TanStack Table. A versão v8 utiliza outro conjunto de funções.
const recursosTabela = tableFeatures({
	rowSortingFeature,
	rowPaginationFeature,
	sortedRowModel: createSortedRowModel(),
	paginatedRowModel: createPaginatedRowModel(),
	sortFns: { alphanumeric: sortFn_alphanumeric, datetime: sortFn_datetime },
});

const coluna = createColumnHelper<typeof recursosTabela, RegistroLeitura>();

const colunas = coluna.columns([
	coluna.accessor("id", { header: "ID", sortFn: "alphanumeric" }),
	coluna.accessor("areaId", { header: "Área ID", sortFn: "alphanumeric" }),
	coluna.accessor("animalId", { header: "Animal ID", sortFn: "alphanumeric" }),
	coluna.accessor((registro) => lerData(registro.dataHora), {
		id: "data",
		header: "Data",
		cell: (celula) => exibirData(celula.row.original.dataHora, "dd/MM/yyyy"),
		sortFn: "datetime",
	}),
	coluna.accessor((registro) => lerData(registro.dataHora), {
		id: "hora",
		header: "Hora",
		cell: (celula) => exibirData(celula.row.original.dataHora, "HH:mm"),
		sortFn: "datetime",
	}),
	coluna.accessor("categoria", { header: "Categoria", sortFn: "alphanumeric" }),
	coluna.accessor("precisaoPercentual", {
		header: "Precisão",
		cell: (celula) => formatarPercentual(celula.getValue()),
	}),
	coluna.accessor("sexo", { header: "Sexo", sortFn: "alphanumeric" }),
	coluna.accessor("receptor", { header: "Receptor", sortFn: "alphanumeric" }),
	coluna.accessor("rssiDbm", {
		header: "RSSI",
		cell: (celula) => formatarRSSI(celula.getValue()),
	}),
	coluna.accessor("bateriaPercentual", {
		header: "Bateria",
		cell: (celula) => formatarPercentual(celula.getValue()),
	}),
]);

// O CSV usa ponto e vírgula para facilitar a abertura em planilhas pt-BR.
const nomesColunasExportacao = [
	"ID",
	"Área ID",
	"Área",
	"Animal ID",
	"Data",
	"Hora",
	"Categoria",
	"Precisão (%)",
	"Sexo",
	"Receptor",
	"RSSI (dBm)",
	"Bateria (%)",
] as const;

function linhaExportacao(registro: RegistroLeitura): (string | number)[] {
	return [
		registro.id,
		registro.areaId,
		registro.nomeArea,
		registro.animalId,
		exibirData(registro.dataHora, "dd/MM/yyyy"),
		exibirData(registro.dataHora, "HH:mm"),
		registro.categoria,
		registro.precisaoPercentual ?? "",
		registro.sexo,
		registro.receptor,
		registro.rssiDbm ?? "",
		registro.bateriaPercentual ?? "",
	];
}

function escaparCelulaCSV(valor: string | number) {
	const texto = String(valor);
	// Evita que valores textuais vindos da API sejam interpretados como fórmulas pelo Excel.
	const seguro = typeof valor === "string" && /^[\s\t]*[=+\-@]/.test(texto) ? `'${texto}` : texto;
	return `"${seguro.replaceAll('"', '""')}"`;
}

function baixarArquivo(conteudo: Blob, nome: string) {
	const endereco = URL.createObjectURL(conteudo);
	const link = document.createElement("a");
	link.href = endereco;
	link.download = nome;
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(endereco), 1000);
}

function exportarCSV(registros: RegistroLeitura[]) {
	const linhas = [nomesColunasExportacao, ...registros.map(linhaExportacao)];
	const conteudo = `\uFEFF${linhas.map((linha) => linha.map(escaparCelulaCSV).join(";")).join("\r\n")}`;
	baixarArquivo(
		new Blob([conteudo], { type: "text/csv;charset=utf-8" }),
		"argos-historico-leitura.csv",
	);
}

async function exportarXLSX(registros: RegistroLeitura[]) {
	// Carregamento sob demanda: a biblioteca só é baixada ao escolher XLSX.
	const { default: ExcelJS } = await import("exceljs");
	const arquivo = new ExcelJS.Workbook();
	const planilha = arquivo.addWorksheet("Histórico de leitura");
	planilha.columns = nomesColunasExportacao.map((nome) => ({
		header: nome,
		width: Math.max(14, nome.length + 5),
	}));
	planilha.addRows(registros.map(linhaExportacao));
	planilha.views = [{ state: "frozen", ySplit: 1 }];
	planilha.autoFilter = { from: "A1", to: `L${Math.max(2, registros.length + 1)}` };
	planilha.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
	planilha.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF503723" } };
	const buffer = await arquivo.xlsx.writeBuffer();
	const bytes = Uint8Array.from(new Uint8Array(buffer));
	baixarArquivo(
		new Blob([bytes], {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		}),
		"argos-historico-leitura.xlsx",
	);
}

export function HistoricoLeitura({
	dados = leiturasSimuladas,
	className,
	permitirExportacao = true,
}: HistoricoLeituraProps) {
	const identificador = useId();
	const [animal, setAnimal] = useState("");
	const [area, setArea] = useState("todas");
	const [categoria, setCategoria] = useState("todas");
	const [intervalo, setIntervalo] = useState<DateRange | undefined>();
	const [erroExportacao, setErroExportacao] = useState("");
	const [exportando, setExportando] = useState(false);

	const areas = useMemo(
		() =>
			[...new Set(dados.map((registro) => registro.nomeArea))].sort((a, b) =>
				a.localeCompare(b, "pt-BR"),
			),
		[dados],
	);
	const categorias = useMemo(
		() =>
			[...new Set(dados.map((registro) => registro.categoria))].sort((a, b) =>
				a.localeCompare(b, "pt-BR"),
			),
		[dados],
	);

	const registrosFiltrados = useMemo(() => {
		const pesquisaAnimal = animal.trim().toLocaleLowerCase("pt-BR");
		return dados.filter((registro) => {
			if (pesquisaAnimal && !registro.animalId.toLocaleLowerCase("pt-BR").includes(pesquisaAnimal))
				return false;
			if (area !== "todas" && registro.nomeArea !== area) return false;
			if (categoria !== "todas" && registro.categoria !== categoria) return false;
			if (intervalo?.from && intervalo?.to) {
				const data = lerData(registro.dataHora);
				if (!data || data < startOfDay(intervalo.from) || data > endOfDay(intervalo.to))
					return false;
			}
			return true;
		});
	}, [dados, animal, area, categoria, intervalo]);

	const tabela = useTable({
		features: recursosTabela,
		data: registrosFiltrados,
		columns: colunas,
		getRowId: (registro) => registro.id,
		initialState: {
			sorting: [{ id: "data", desc: true }],
			pagination: { pageIndex: 0, pageSize: 10 },
		},
	});

	const filtrosAtivos =
		Boolean(animal.trim()) ||
		area !== "todas" ||
		categoria !== "todas" ||
		Boolean(intervalo?.from && intervalo.to);
	const totalFiltrado = registrosFiltrados.length;
	const indicePagina = tabela.state.pagination.pageIndex;
	const tamanhoPagina = tabela.state.pagination.pageSize;
	const numeroPaginas = tabela.getPageCount();
	const inicio = totalFiltrado === 0 ? 0 : indicePagina * tamanhoPagina + 1;
	const fim = Math.min(totalFiltrado, (indicePagina + 1) * tamanhoPagina);

	function redefinirFiltros() {
		setAnimal("");
		setArea("todas");
		setCategoria("todas");
		setIntervalo(undefined);
		tabela.setPageIndex(0);
	}

	async function executarExportacao(formato: "csv" | "xlsx") {
		if (exportando) return;
		setErroExportacao("");
		setExportando(true);
		// Todas as linhas após filtragem e ordenação, não apenas a página exibida.
		const registros = tabela.getPrePaginatedRowModel().rows.map((linha) => linha.original);
		try {
			if (formato === "csv") exportarCSV(registros);
			else await exportarXLSX(registros);
		} catch {
			setErroExportacao("Não foi possível gerar o arquivo. Tente novamente.");
		} finally {
			setExportando(false);
		}
	}

	return (
		<Card
			className={cn(
				"@container w-full min-w-0 gap-3 overflow-hidden bg-card py-3 @min-[630px]:gap-4 @min-[630px]:py-5",
				className,
			)}
		>
			<CardHeader className="gap-3 @min-[630px]:flex @min-[630px]:flex-row @min-[630px]:items-center @min-[630px]:justify-between">
				<CardTitle className="text-lg leading-tight font-normal @min-[400px]:text-xl @min-[780px]:text-2xl">
					Histórico de Leitura
				</CardTitle>
				<div className="flex flex-wrap items-center gap-2">
					<Popover>
						<PopoverTrigger
							render={
								<Button
									variant="outline"
									className="h-8 gap-1.5 rounded-full border-border bg-card px-3 text-xs @min-[500px]:h-9 @min-[500px]:text-sm"
								/>
							}
						>
							<ListFilter aria-hidden="true" className="size-4" />
							Filtro{filtrosAtivos ? " •" : ""}
						</PopoverTrigger>
						<PopoverContent
							align="end"
							className="w-[min(340px,calc(100vw-24px))] max-h-[min(85vh,680px)] overflow-y-auto p-4"
						>
							<div className="mb-3 flex items-center justify-between gap-3">
								<h3 className="text-base font-medium">Filtrar leituras</h3>
								<Button size="sm" variant="ghost" className="gap-1" onClick={redefinirFiltros}>
									<RotateCcw className="size-3.5" /> Limpar
								</Button>
							</div>
							<div className="grid gap-3">
								<div className="grid gap-1.5">
									<Label htmlFor={`${identificador}-animal`}>Animal (identificação)</Label>
									<Input
										id={`${identificador}-animal`}
										placeholder="Ex.: 003"
										value={animal}
										onChange={(evento) => {
											setAnimal(evento.target.value);
											tabela.setPageIndex(0);
										}}
										className="text-sm"
									/>
								</div>
								<div className="grid gap-1.5">
									<Label>Área ou setor</Label>
									<Select
										value={area}
										onValueChange={(valor) => {
											setArea(valor ?? "todas");
											tabela.setPageIndex(0);
										}}
									>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="todas">Todas as áreas</SelectItem>
											{areas.map((nome) => (
												<SelectItem key={nome} value={nome}>
													{nome}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="grid gap-1.5">
									<Label>Categoria de comportamento</Label>
									<Select
										value={categoria}
										onValueChange={(valor) => {
											setCategoria(valor ?? "todas");
											tabela.setPageIndex(0);
										}}
									>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="todas">Todas as categorias</SelectItem>
											{categorias.map((nome) => (
												<SelectItem key={nome} value={nome}>
													{nome}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="grid w-full min-w-0 gap-1.5">
									<Label>Intervalo de datas</Label>
									<div className="w-full min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
										<Calendar
											mode="range"
											locale={ptBR}
											numberOfMonths={1}
											selected={intervalo}
											onSelect={(valor) => {
												setIntervalo(valor);
												tabela.setPageIndex(0);
											}}
											className="bg-card [--cell-size:--spacing(8)]"
											classNames={{ root: "w-full" }}
										/>
									</div>
									<p className="text-xs text-muted-foreground">
										{intervalo?.from && intervalo?.to
											? `${format(intervalo.from, "dd/MM/yyyy")} a ${format(intervalo.to, "dd/MM/yyyy")}`
											: "Selecione o dia inicial e o final."}
									</p>
								</div>
							</div>
						</PopoverContent>
					</Popover>

					{permitirExportacao && (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										variant="outline"
										disabled={exportando}
										className="h-8 gap-1.5 rounded-full border-border bg-card px-3 text-xs @min-[500px]:h-9 @min-[500px]:text-sm"
									/>
								}
							>
								<Download aria-hidden="true" className="size-4" />
								{exportando ? "Gerando..." : "Exportar"}
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									onClick={() => {
										void executarExportacao("csv");
									}}
								>
									<FileText className="size-4" /> Exportar CSV
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => {
										void executarExportacao("xlsx");
									}}
								>
									<FileSpreadsheet className="size-4" /> Exportar XLSX
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</CardHeader>

			<CardContent className="space-y-3">
				<div className="border-t border-foreground/80 pt-2">
					<Table className="min-w-[1100px] text-[11px] @min-[700px]:text-xs @min-[1250px]:text-sm">
						<TableHeader>
							{tabela.getHeaderGroups().map((grupo) => (
								<TableRow key={grupo.id} className="border-b border-border/70 hover:bg-transparent">
									{grupo.headers.map((cabecalho) => (
										<TableHead
											key={cabecalho.id}
											className="h-9 px-2 text-center font-normal text-foreground"
										>
											{cabecalho.isPlaceholder ? null : (
												<button
													type="button"
													className="inline-flex max-w-full cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-sm py-1 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
													onClick={cabecalho.column.getToggleSortingHandler()}
													aria-label={`Ordenar por ${String(cabecalho.column.columnDef.header)}`}
												>
													<span>
														<tabela.FlexRender header={cabecalho} />
													</span>
													{cabecalho.column.getIsSorted() === "asc" ? (
														<ArrowUp className="size-3" />
													) : cabecalho.column.getIsSorted() === "desc" ? (
														<ArrowDown className="size-3" />
													) : (
														<ArrowDownUp className="size-3 opacity-35" />
													)}
												</button>
											)}
										</TableHead>
									))}
								</TableRow>
							))}
						</TableHeader>
						<TableBody>
							{tabela.getRowModel().rows.length ? (
								tabela.getRowModel().rows.map((linha, indice) => (
									<TableRow
										key={linha.id}
										className={cn(
											"border-b-0 hover:bg-accent/70",
											indice % 2 === 0 ? "bg-muted/70" : "bg-card",
										)}
									>
										{linha.getAllCells().map((celula) => (
											<TableCell
												key={celula.id}
												className="h-9 px-2 py-1.5 text-center tabular-nums"
											>
												<tabela.FlexRender cell={celula} />
											</TableCell>
										))}
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell
										colSpan={colunas.length}
										className="h-24 text-center text-muted-foreground"
									>
										Nenhuma leitura encontrada para os filtros selecionados.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
				{erroExportacao && (
					<p role="alert" className="text-xs text-destructive">
						{erroExportacao}
					</p>
				)}
				<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground @min-[700px]:text-sm">
					<span aria-live="polite">
						Exibindo {inicio}–{fim} de {totalFiltrado} registros
					</span>
					<div className="flex items-center gap-2">
						<Label className="whitespace-nowrap text-xs">Por página</Label>
						<Select
							value={String(tamanhoPagina)}
							onValueChange={(valor) => {
								if (valor) {
									tabela.setPageSize(Number(valor));
									tabela.setPageIndex(0);
								}
							}}
						>
							<SelectTrigger size="sm" className="w-[68px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{[10, 25, 50].map((tamanho) => (
									<SelectItem key={tamanho} value={String(tamanho)}>
										{tamanho}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<span className="whitespace-nowrap tabular-nums">
							{numeroPaginas ? indicePagina + 1 : 0}/{numeroPaginas}
						</span>
						<Button
							variant="outline"
							size="icon-sm"
							className="rounded-md"
							disabled={!tabela.getCanPreviousPage()}
							onClick={() => tabela.previousPage()}
							aria-label="Página anterior"
						>
							<ChevronLeft className="size-4" />
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							className="rounded-md"
							disabled={!tabela.getCanNextPage()}
							onClick={() => tabela.nextPage()}
							aria-label="Próxima página"
						>
							<ChevronRight className="size-4" />
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
