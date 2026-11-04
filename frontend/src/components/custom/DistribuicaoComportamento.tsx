import { ArrowUpRight, Camera } from "lucide-react"
import { Link } from "react-router"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { IndicadorComportamento } from "@/components/custom/IndicadorComportamento"

export type DadosDistribuicaoComportamento = {
  status: "normal" | "anormal"
  feedingPercent: number
  restingPercent: number
  movementPercent: number
  groupingPercent: number
  distantAnimalsCount: number
}

type DistribuicaoComportamentoProps = {
  data?: DadosDistribuicaoComportamento
  detailsPath?: string
}

// Dados simulados; futuramente poderão ser fornecidos pela API Argos.
const dadosSimulados: DadosDistribuicaoComportamento = {
  status: "normal",
  feedingPercent: 42,
  restingPercent: 21,
  movementPercent: 31,
  groupingPercent: 6,
  distantAnimalsCount: 2,
}

function obterMensagemAnimaisDistantes(quantidade: number): string {
  const quantidadeSegura = Number.isFinite(quantidade)
    ? Math.max(0, Math.trunc(quantidade))
    : 0

  if (quantidadeSegura === 0) return "Nenhum animal distante do Grupo"
  if (quantidadeSegura === 1) return "1 Animal distante do Grupo"
  return `${quantidadeSegura.toLocaleString("pt-BR")} Animais distantes do Grupo`
}

export function DistribuicaoComportamento({
  data = dadosSimulados,
  detailsPath,
}: DistribuicaoComportamentoProps) {
  const normal = data.status === "normal"
  const comportamentos = [
    { label: "Alimentação", percentage: data.feedingPercent },
    { label: "Descanso", percentage: data.restingPercent },
    { label: "Movimento", percentage: data.movementPercent },
    { label: "Agrupamento", percentage: data.groupingPercent },
  ]

  return (
    <Card className="@container relative w-full min-w-0 gap-0 overflow-hidden py-0">
      <CardHeader className="min-w-0 px-3 pt-3 pr-[62px] pb-0 @min-[380px]:px-4 @min-[380px]:pt-4 @min-[380px]:pr-[76px] @min-[680px]:px-6 @min-[680px]:pt-6 @min-[680px]:pr-[94px] @min-[760px]:pr-[42%]">
        <CardTitle className="flex min-w-0 items-start gap-1.5 text-sm leading-snug font-normal @min-[380px]:gap-2 @min-[380px]:text-lg @min-[620px]:text-xl @min-[850px]:text-2xl">
          <Camera
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 @min-[380px]:size-5 @min-[680px]:size-6"
          />
          <span className="min-w-0 break-words">Distribuição de Comportamento</span>
        </CardTitle>
      </CardHeader>

      {/* Faixa pequena nos cards estreitos; recupera a largura do Figma nos grandes. */}
      <div className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-bl-2xl bg-primary text-white @min-[380px]:size-14 @min-[760px]:h-[74px] @min-[760px]:w-[min(40%,347px)] @min-[760px]:justify-end @min-[760px]:pr-5">
        {detailsPath ? (
          <Link
            to={detailsPath}
            aria-label="Ver detalhes da distribuição de comportamento"
            title="Ver detalhes da distribuição de comportamento"
            className="inline-flex size-full items-center justify-center rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-white @min-[760px]:size-auto"
          >
            <ArrowUpRight
              aria-hidden="true"
              className="size-6 @min-[380px]:size-8 @min-[760px]:size-10"
              strokeWidth={2.25}
            />
          </Link>
        ) : (
          <ArrowUpRight aria-hidden="true" className="size-6 @min-[380px]:size-8 @min-[760px]:size-10" strokeWidth={2.25} />
        )}
      </div>

      <CardContent className="min-w-0 px-3 pt-4 pb-4 @min-[380px]:px-4 @min-[380px]:pt-5 @min-[680px]:px-6 @min-[680px]:pt-6 @min-[680px]:pb-6">
        <div className="flex items-center gap-1.5 text-xs leading-4 @min-[380px]:gap-2 @min-[380px]:text-sm @min-[680px]:gap-2.5 @min-[680px]:text-base @min-[680px]:leading-5">
          <span
            aria-hidden="true"
            className={`inline-block size-3 shrink-0 rounded-full @min-[380px]:size-4 @min-[680px]:size-5 ${
              normal ? "bg-green-600" : "bg-destructive"
            }`}
          />
          <span>
            <strong className="font-bold">Status:</strong> {normal ? "Normal" : "Anormal"}
          </span>
        </div>

        <div className="mt-4 grid min-w-0 grid-cols-1 gap-x-5 gap-y-3 @min-[380px]:mt-6 @min-[680px]:mt-9 @min-[760px]:grid-cols-2 @min-[760px]:gap-y-4">
          {comportamentos.map((comportamento) => (
            <IndicadorComportamento
              key={comportamento.label}
              label={comportamento.label}
              percentage={comportamento.percentage}
            />
          ))}
        </div>

        <p className="mt-4 break-words text-xs leading-4 @min-[380px]:mt-5 @min-[380px]:text-sm @min-[680px]:mt-6 @min-[680px]:text-base @min-[680px]:leading-6">
          {obterMensagemAnimaisDistantes(data.distantAnimalsCount)}
        </p>
      </CardContent>
    </Card>
  )
}
