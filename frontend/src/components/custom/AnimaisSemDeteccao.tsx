import { Camera } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { cn } from "cn"

import { Card } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

/** Percentual de animais sem detecção em cada intervalo, no período atual e no anterior. */
export type RegistroSemDeteccao = { horario: string; anterior: number | null; atual: number | null }

export type AnimaisSemDeteccaoDados = {
  /** Animais cuja última posição foi a zona e que estão sem detecção nos últimos 5 minutos. */
  quantidade: number
  /** Maior tempo, em minutos, desde a última detecção entre esses animais; `null` sem casos. */
  maiorTempoMinutos: number | null
  /** Animais detectados na zona nos últimos 5 minutos. */
  detectadosAgora: number
}

type AnimaisSemDeteccaoProps = {
  dados: AnimaisSemDeteccaoDados | null
  /** Série do gráfico, calculada do histórico da zona; `null` enquanto carrega. */
  serie: RegistroSemDeteccao[] | null
  /** Explica a série (ou o motivo de não haver série) abaixo do gráfico. */
  nota?: string
  className?: string
}

const configuracao = {
  anterior: { label: "Período anterior", color: "var(--primary)" },
  atual: { label: "Período atual", color: "var(--secondary)" },
} satisfies ChartConfig

function formatarDuracao(minutos: number | null) {
  if (minutos == null) return "—"
  if (minutos < 60) return `${Math.round(minutos)} min`
  const horas = Math.floor(minutos / 60)
  if (horas >= 48) return `${Math.floor(horas / 24)} dias`
  const resto = Math.round(minutos % 60)
  return resto ? `${horas} h ${resto} min` : `${horas} h`
}

/**
 * Adaptação do card "Animais Fora da Área de Cobertura" do Figma. Sem GPS nem geofence, a
 * informação real disponível é a ausência de detecção recente por qualquer receptor.
 */
export function AnimaisSemDeteccao({ dados, serie, nota, className }: AnimaisSemDeteccaoProps) {
  const metricas = [
    ["Qtd Sem Detecção", dados ? dados.quantidade.toLocaleString("pt-BR") : "—"],
    ["Maior Tempo Sem Detecção", formatarDuracao(dados?.maiorTempoMinutos ?? null)],
    ["Detectados Agora", dados ? dados.detectadosAgora.toLocaleString("pt-BR") : "—"],
  ] as const

  return (
    <Card className={cn("@container relative h-full min-w-0 gap-0 py-0", className)}>
      <div className="flex h-full min-w-0 flex-col px-4 pt-5 pb-5 @min-[600px]:px-[30px] @min-[600px]:pt-0 @min-[600px]:pb-[47px]">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 @min-[600px]:min-h-[73px]">
          <h2 className="flex min-w-0 items-center gap-2.5 text-xl leading-tight font-normal @min-[600px]:text-[30px]">
            <Camera aria-hidden="true" className="size-5 shrink-0 @min-[600px]:size-[26px]" />
            Animais Sem Detecção Recente
          </h2>
          <div aria-label="Legenda do gráfico" className="flex shrink-0 items-center gap-3 text-xs @min-[600px]:mt-6 @min-[600px]:gap-5 @min-[600px]:text-sm">
            <span className="flex items-center gap-1.5 @min-[600px]:gap-2.5"><span aria-hidden="true" className="size-3 rounded-[3px] bg-primary @min-[600px]:size-6" />Período anterior</span>
            <span className="flex items-center gap-1.5 @min-[600px]:gap-2.5"><span aria-hidden="true" className="size-3 rounded-[3px] bg-secondary @min-[600px]:size-6" />Período atual</span>
          </div>
        </div>

        <div className="relative mt-3 min-h-0 flex-1 @min-[600px]:mt-3">
          <div role="region" tabIndex={0} aria-label="Percentual de animais sem detecção na zona por intervalo" className="w-full min-w-0 overflow-x-auto focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring">
            <ChartContainer config={configuracao} className="aspect-auto h-[200px] w-full min-w-[520px] @min-[600px]:h-[262px]">
              <LineChart accessibilityLayer data={serie ?? []} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid vertical horizontal stroke="var(--border)" />
                <XAxis dataKey="horario" interval={(serie?.length ?? 0) > 12 ? "preserveStartEnd" : 0} minTickGap={8} axisLine={false} tickLine={false} tickMargin={10} tick={{ fontSize: 11, fill: "var(--foreground)" }} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} width={36} tick={{ fontSize: 11, fill: "var(--foreground)" }} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={h => String(h)} formatter={(valor, nome) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">{nome === "anterior" || nome === "Período anterior" ? "Período anterior" : "Período atual"}</span>
                    <span className="font-medium tabular-nums">{valor == null ? "—" : `${String(valor)}%`}</span>
                  </div>
                )} />} />
                <Line name="Período anterior" connectNulls={false} type="linear" dataKey="anterior" stroke="var(--color-anterior)" strokeWidth={2} dot={{ r: 4.5, strokeWidth: 0, fill: "var(--color-anterior)" }} isAnimationActive={false} />
                <Line name="Período atual" connectNulls={false} type="linear" dataKey="atual" stroke="var(--color-atual)" strokeWidth={2} dot={{ r: 4.5, strokeWidth: 0, fill: "var(--color-atual)" }} isAnimationActive={false} />
              </LineChart>
            </ChartContainer>
          </div>
          {serie == null && <p role="status" className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Carregando o histórico da zona…</p>}
        </div>
        {nota && <p className="mt-2 text-xs text-muted-foreground @min-[600px]:text-sm">{nota}</p>}

        <dl className="mt-6 grid gap-3 rounded-lg border-2 border-foreground/25 px-4 py-3 @min-[480px]:grid-cols-[1.1fr_1fr_0.75fr] @min-[600px]:mt-8 @min-[600px]:px-5 @min-[600px]:py-[18px] @min-[820px]:px-[25px]">
          {metricas.map(([nome, valor]) => (
            <div key={nome} className="min-w-0">
              <dt className="text-xs @min-[600px]:text-[15px]">{nome}</dt>
              <dd className="mt-0.5 text-lg leading-tight font-semibold @min-[600px]:text-[22px]">{valor}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  )
}
