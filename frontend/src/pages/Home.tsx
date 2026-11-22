import { AnaliseGeral } from "@/components/custom/AnaliseGeral";
import { AnalisesModelo } from "@/components/custom/AnalisesModelo";
import { DistribuicaoComportamento } from "@/components/custom/DistribuicaoComportamento";
import { ReceptorCard, receptorSimulado } from "@/components/custom/ReceptorCard";
import { RelatorioProcessamentoImagens } from "@/components/custom/RelatorioProcessamentoImagens";
import { ReceptorResumoCard, resumoReceptorSimulado } from "@/components/custom/ResumoReceptorCard";
import { useState } from "react";
import { SeletorPeriodo, type PeriodoVisualizacao } from "@/components/custom/SeletorPeriodo";
import { intervaloSimulado, type IntervaloDatas } from "@/components/custom/CalendarioIntervalo";
import { SeletorIntervaloDatas } from "@/components/custom/SeletorIntervaloDatas";
import { CartaoAlerta, alertaSimulado } from "@/components/custom/CartaoAlerta";
import { DadosProcessadosDia } from "@/components/custom/DadosProcessadosDia";
import { TemperaturaMedia } from "@/components/custom/TemperaturaMedia";
import { ContabilizacaoCabecasMes } from "@/components/custom/ContabilizacaoCabecasMes";
import { MediaMovimentacao } from "@/components/custom/MediaMovimentacao";
import { QuantidadeCabecas, setoresSimulados } from "@/components/custom/QuantidadeCabecas";
import { ResumoCurral, curralSimulado } from "@/components/custom/ResumoCurral";
import { HistoricoLeitura, leiturasSimuladas } from "@/components/custom/HistoricoLeitura";

export default function Home() {
	const [intervalo, setIntervalo] = useState<IntervaloDatas | undefined>(intervaloSimulado);
	const [periodo, setPeriodo] = useState<PeriodoVisualizacao>("dia");

	return (
		<div className="gap-5">
			<h1>Tela de Home</h1>
			<div className="grid min-w-0 gap-4">
				<div className="flex flex-wrap gap-3">
					<SeletorIntervaloDatas value={intervalo} onChange={setIntervalo} />
					<SeletorPeriodo value={periodo} onChange={setPeriodo} />
				</div>
				<CartaoAlerta data={alertaSimulado} />
			</div>
			<HistoricoLeitura dados={leiturasSimuladas} permitirExportacao />
			<ResumoCurral dados={curralSimulado} />
			<QuantidadeCabecas dados={setoresSimulados} />
			<DadosProcessadosDia />
			<TemperaturaMedia />
			<MediaMovimentacao />
			<ContabilizacaoCabecasMes />
			<RelatorioProcessamentoImagens />
			<AnalisesModelo detailsPath="" />
			<ReceptorCard data={receptorSimulado} detailsPath="" />
			<AnaliseGeral detailsPath="" />
			<ReceptorResumoCard data={resumoReceptorSimulado} />
			<DistribuicaoComportamento />
		</div>
	);
}
