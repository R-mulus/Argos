import type { ReactNode } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export type RegistroMensalCabecas = {
  /** Identificação do mês, por exemplo: "Jan". */
  mes: string
  /** Quantidade de animais contabilizada no mês. */
  real: number
  /** Meta de animais estabelecida para o mês. Sem meta em nenhum mês, a série "Ideal" não aparece. */
  ideal?: number
}

export type ContabilizacaoCabecasMesProps = {
  /** Dados já ordenados conforme devem aparecer no eixo horizontal. */
  dados?: RegistroMensalCabecas[]
  /** Nomes das séries na legenda e no tooltip. */
  rotulos?: { real: string; ideal?: string }
  /** Texto curto sob o título, explicando a origem dos números. */
  descricao?: string
  /** Título do card. */
  titulo?: string
  /** Mostrado no lugar do gráfico quando não há meses com dados; o card mantém o espaço. */
  aviso?: ReactNode
  className?: string
}

// Valores ilustrativos para o período de janeiro a dezembro.
// Substituir por dados vindos da API quando estiver disponível.
const dadosSimulados: RegistroMensalCabecas[] = [
  { mes: "Jan", real: 860, ideal: 740 },
  { mes: "Fev", real: 300, ideal: 90 },
  { mes: "Mar", real: 510, ideal: 450 },
  { mes: "Abr", real: 250, ideal: 380 },
  { mes: "Mai", real: 235, ideal: 500 },
  { mes: "Jun", real: 660, ideal: 800 },
  { mes: "Jul", real: 390, ideal: 420 },
  { mes: "Ago", real: 605, ideal: 520 },
  { mes: "Set", real: 285, ideal: 790 },
  { mes: "Out", real: 530, ideal: 785 },
  { mes: "Nov", real: 680, ideal: 760 },
  { mes: "Dez", real: 730, ideal: 810 },
]

const configuracaoGrafico = {
  real: {
    label: "Real",
    color: "var(--primary)",
  },
  ideal: {
    label: "Ideal",
    color: "var(--secondary)",
  },
} satisfies ChartConfig

const formatarQuantidade = (valor: number) => valor.toLocaleString("pt-BR")

export function ContabilizacaoCabecasMes({
  dados = dadosSimulados,
  rotulos = { real: "Real", ideal: "Ideal" },
  descricao,
  titulo = "Contabilização de Cabeças Per/Mês",
  aviso,
  className,
}: ContabilizacaoCabecasMesProps) {
  const semDados = dados.length === 0 && aviso !== undefined
  const comMeta = dados.some((registro) => registro.ideal != null)
  const configuracao = {
    real: { ...configuracaoGrafico.real, label: rotulos.real },
    ideal: { ...configuracaoGrafico.ideal, label: rotulos.ideal ?? "Ideal" },
  } satisfies ChartConfig
  return (
    <Card
      className={`@container w-full min-w-0 gap-5 py-5 @min-[700px]:gap-7 @min-[700px]:py-6 ${className ?? ""}`}
    >
      <CardHeader className="px-4 @min-[650px]:px-7">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <CardTitle className="min-w-0 text-base leading-tight font-normal @min-[460px]:text-xl @min-[850px]:text-2xl">
            {titulo}
          </CardTitle>

          {/* Legenda junto ao título, como no Figma. */}
          {!semDados && <div className="flex shrink-0 items-center gap-3 text-xs @min-[550px]:gap-5 @min-[550px]:text-sm">
            <span className="flex items-center gap-1.5 @min-[550px]:gap-2.5">
              <span aria-hidden="true" className="size-3 rounded-[3px] bg-primary @min-[550px]:size-6 @min-[850px]:size-7" />
              {rotulos.real}
            </span>
            {comMeta && (
              <span className="flex items-center gap-1.5 @min-[550px]:gap-2.5">
                <span aria-hidden="true" className="size-3 rounded-[3px] bg-secondary @min-[550px]:size-6 @min-[850px]:size-7" />
                {rotulos.ideal ?? "Ideal"}
              </span>
            )}
          </div>}
        </div>
        {descricao && <p className="mt-1 text-xs text-muted-foreground @min-[650px]:text-sm">{descricao}</p>}
      </CardHeader>

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col px-2 @min-[650px]:px-5">
        {semDados ? (
          <div className="flex min-h-[200px] flex-1 items-center px-2 @min-[650px]:min-h-[230px]">{aviso}</div>
        ) : (<>
        {/* O gráfico ocupa a altura que sobra no card (mesma linha do card ao lado).
            A largura mínima mantém os 12 meses legíveis em cards estreitos.
            O usuário pode rolar horizontalmente, inclusive por teclado. */}
        <div
          role="region"
          aria-label="Gráfico mensal de cabeças de gado; role horizontalmente se os meses não couberem"
          tabIndex={0}
          className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-auto pb-2 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChartContainer
            config={configuracao}
            className={`aspect-auto min-h-[200px] w-full flex-1 @min-[650px]:min-h-[230px] ${dados.length > 6 ? "min-w-[820px]" : "min-w-[360px]"}`}
          >
            <BarChart
              accessibilityLayer
              data={dados}
              barGap={3}
              barCategoryGap="18%"
              margin={{ top: 8, right: 10, left: 0, bottom: 2 }}
            >
              <CartesianGrid vertical horizontal stroke="var(--border)" />
              <XAxis
                dataKey="mes"
                axisLine={false}
                tickLine={false}
                tickMargin={12}
                interval={0}
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
                width={50}
                tick={{ fontSize: 12, fill: "var(--foreground)" }}
                tickFormatter={formatarQuantidade}
              />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", fillOpacity: 0.45 }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(mes) => `Mês: ${String(mes)}`}
                  />
                }
              />
              {comMeta && (
                <Bar
                  dataKey="ideal"
                  name={rotulos.ideal ?? "Ideal"}
                  fill="var(--color-ideal)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={37}
                />
              )}
              <Bar
                dataKey="real"
                name={rotulos.real}
                fill="var(--color-real)"
                radius={[5, 5, 0, 0]}
                maxBarSize={37}
              />
            </BarChart>
          </ChartContainer>
        </div>
      </>)}
      </CardContent>
    </Card>
  )
}
