import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { AvisoEstado } from "@/components/custom/AvisoEstado"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

/**
 * Um ponto da série de movimentação: o mesmo horário no período anterior e no atual.
 * `null` marca horário sem medição (a linha é interrompida, nunca preenchida com zero).
 */
export type RegistroMovimentacao = {
  /** Horário ou intervalo exibido no eixo horizontal. */
  horario: string
  anterior: number | null
  atual: number | null
}

export type MediaMovimentacaoProps = {
  /**
   * Série real, ordenada por horário. `null` (padrão) indica que ainda não existe fonte validada:
   * o card mostra o aviso de espera, sem valores simulados.
   */
  dados?: RegistroMovimentacao[] | null
  /** Título do card. A métrica atual é por zona; não há distância medida pelo RSSI. */
  titulo?: string
  /** Unidade exibida no eixo e no tooltip (ex.: "trocas de zona"). */
  unidade?: string
  /** Texto do aviso enquanto não há fonte de dados. */
  mensagemSemFonte?: string
  className?: string
}

const configuracaoGrafico = {
  anterior: { label: "Anterior", color: "var(--primary)" },
  atual: { label: "Atual", color: "var(--secondary)" },
} satisfies ChartConfig

const formatarValor = (valor: number) =>
  valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })

export function MediaMovimentacao({
  dados = null,
  titulo = "Movimentação entre Zonas",
  unidade = "",
  mensagemSemFonte = "As informações serão exibidas após a integração dos dispositivos ESP32.",
  className,
}: MediaMovimentacaoProps) {
  const sufixo = unidade ? ` ${unidade}` : ""
  return (
    <Card
      className={`@container w-full min-w-0 gap-5 overflow-hidden py-5 @min-[700px]:gap-7 @min-[700px]:py-6 ${className ?? ""}`}
    >
      <CardHeader className="px-4 @min-[650px]:px-7">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <CardTitle className="min-w-0 text-base leading-tight font-normal @min-[460px]:text-xl @min-[850px]:text-2xl">
            {titulo}
          </CardTitle>

          {dados !== null && dados.length > 0 && <div
            aria-label="Legenda do gráfico"
            className="flex shrink-0 flex-wrap items-center gap-3 text-xs @min-[550px]:gap-5 @min-[550px]:text-sm"
          >
            <span className="flex items-center gap-1.5 @min-[550px]:gap-2.5">
              <span
                aria-hidden="true"
                className="size-3 rounded-[3px] bg-primary @min-[550px]:size-6 @min-[850px]:size-7"
              />
              Anterior
            </span>
            <span className="flex items-center gap-1.5 @min-[550px]:gap-2.5">
              <span
                aria-hidden="true"
                className="size-3 rounded-[3px] bg-secondary @min-[550px]:size-6 @min-[850px]:size-7"
              />
              Atual
            </span>
          </div>}
        </div>
      </CardHeader>

      <CardContent className="min-w-0 px-2 @min-[650px]:px-5">
        {dados === null ? (
          <div className="flex min-h-[220px] items-center px-2 @min-[650px]:min-h-[270px] @min-[980px]:min-h-[315px]">
            <AvisoEstado tom="informacao" titulo="Aguardando dados reais de movimentação" className="w-full">
              {mensagemSemFonte}
            </AvisoEstado>
          </div>
        ) : dados.length === 0 ? (
          <div className="flex min-h-[220px] items-center px-2 @min-[650px]:min-h-[270px]">
            <AvisoEstado tom="informacao" titulo="Sem movimentação registrada no período" className="w-full" />
          </div>
        ) : (
          <div
            role="region"
            aria-label={`${titulo}: comparação do período anterior com o atual. Role horizontalmente para ver todos os horários.`}
            tabIndex={0}
            className="w-full min-w-0 overflow-x-auto pb-2 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ChartContainer
              config={configuracaoGrafico}
              className="aspect-auto h-[220px] w-full @min-[650px]:h-[270px] @min-[980px]:h-[315px]"
              style={{ minWidth: Math.max(720, dados.length * 74) }}
            >
              <LineChart
                accessibilityLayer
                data={dados}
                margin={{ top: 8, right: 28, left: 0, bottom: 2 }}
              >
                <CartesianGrid
                  vertical
                  horizontal
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="horario"
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={12}
                  tick={{ fontSize: 12, fill: "var(--foreground)" }}
                />
                <YAxis
                  type="number"
                  domain={[0, "auto"]}
                  allowDecimals={false}
                  tickCount={5}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  width={52}
                  tick={{ fontSize: 12, fill: "var(--foreground)" }}
                  tickFormatter={(valor: number) => formatarValor(valor)}
                />
                <ChartTooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(horario) => `Horário: ${String(horario)}`}
                      formatter={(valor, nome) => (
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="text-muted-foreground">
                            {nome === "anterior" || nome === "Anterior" ? "Anterior" : "Atual"}
                          </span>
                          <span className="font-medium tabular-nums">
                            {typeof valor === "number" ? `${formatarValor(valor)}${sufixo}` : "—"}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Line
                  name="Anterior"
                  type="linear"
                  dataKey="anterior"
                  stroke="var(--color-anterior)"
                  strokeWidth={2.5}
                  dot={{ r: 5.5, strokeWidth: 0, fill: "var(--color-anterior)" }}
                  activeDot={{ r: 7, strokeWidth: 0 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  name="Atual"
                  type="linear"
                  dataKey="atual"
                  stroke="var(--color-atual)"
                  strokeWidth={2.5}
                  dot={{ r: 5.5, strokeWidth: 0, fill: "var(--color-atual)" }}
                  activeDot={{ r: 7, strokeWidth: 0 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
