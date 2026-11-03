import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

/** Valores médios de movimentação do rebanho, em metros por hora (m/h). */
export type RegistroMovimentacao = {
  /** Horário do período monitorado, exibido no eixo horizontal. */
  horario: string
  /** Média de movimentação dos animais no dia anterior, em m/h. */
  anterior: number
  /** Média de movimentação dos animais no dia atual, em m/h. */
  atual: number
}

export type MediaMovimentacaoProps = {
  /** Registros ordenados por horário; caso não fornecidos, usa dados fictícios. */
  dados?: RegistroMovimentacao[]
  className?: string
}

// Dados fictícios aproximados do Figma, apenas para desenvolvimento.
// A estimativa de distância percorrida não é calculada por este componente.
const dadosSimulados: RegistroMovimentacao[] = [
  { horario: "06:00", anterior: 370, atual: 500 },
  { horario: "06:30", anterior: 700, atual: 290 },
  { horario: "07:00", anterior: 705, atual: 800 },
  { horario: "07:30", anterior: 600, atual: 690 },
  { horario: "08:00", anterior: 530, atual: 450 },
  { horario: "08:30", anterior: 320, atual: 200 },
  { horario: "09:00", anterior: 510, atual: 430 },
  { horario: "09:30", anterior: 665, atual: 500 },
  { horario: "10:00", anterior: 430, atual: 335 },
  { horario: "10:30", anterior: 280, atual: 370 },
]

const configuracaoGrafico = {
  anterior: { label: "Anterior", color: "var(--primary)" },
  atual: { label: "Atual", color: "var(--secondary)" },
} satisfies ChartConfig

const formatarValor = (valor: number) =>
  valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })

export function MediaMovimentacao({
  dados = dadosSimulados,
  className,
}: MediaMovimentacaoProps) {
  return (
    <Card
      className={`@container w-full min-w-0 gap-5 overflow-hidden py-5 @min-[700px]:gap-7 @min-[700px]:py-6 ${className ?? ""}`}
    >
      <CardHeader className="px-4 @min-[650px]:px-7">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <CardTitle className="min-w-0 text-base leading-tight font-normal @min-[460px]:text-xl @min-[850px]:text-2xl">
            Média de Movimentação em m/h
          </CardTitle>

          <div
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
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-w-0 px-2 @min-[650px]:px-5">
        {dados.length === 0 ? (
          <p className="px-2 py-12 text-center text-xs text-muted-foreground @min-[500px]:text-sm">
            Não há dados de movimentação para o período selecionado.
          </p>
        ) : (
          <div
            role="region"
            aria-label="Comparação da movimentação média do dia anterior e do dia atual. Role horizontalmente para ver todos os horários."
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
                margin={{ top: 8, right: 12, left: 0, bottom: 2 }}
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
                            {typeof valor === "number" ? formatarValor(valor) : String(valor)} m/h
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
