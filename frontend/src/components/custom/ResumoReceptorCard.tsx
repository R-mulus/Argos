import type { ComunicacaoReceptor } from "@argos/shared"
import { SatelliteDish } from "lucide-react"
import { cn } from "cn"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  StatusIndicator,
  textoComunicacao,
} from "@/components/custom/IndicadorStatus"
import { SignalStrengthIndicator } from "@/components/custom/IndicadorForcaSinal"

export type ReceptorResumoData = ComunicacaoReceptor & {
  rssiDbm?: number | null
  model?: string | null
  batteryPercent?: number | null
}

type ReceptorResumoCardProps = {
  data: ReceptorResumoData
  className?: string
}

// Dados de demonstração. Futuramente serão fornecidos pela API Argos.
export const resumoReceptorSimulado: ReceptorResumoData = {
  id: "receptor-01",
  nome: "R01 - Curral",
  codigo: "R01-3XPQ2",
  ultima_comunicacao_em: null,
  status: "ativo",
  estado_comunicacao: "recente",
  rssiDbm: -60,
  batteryPercent: 68,
  model: "ESP32 C3",
}

export function ReceptorResumoCard({
  data,
  className,
}: ReceptorResumoCardProps) {
  const isOnline = data.estado_comunicacao === "recente"
  const hasCurrentReading = isOnline && data.rssiDbm !== null && Number.isFinite(data.rssiDbm)
  const rssiText = hasCurrentReading ? `${data.rssiDbm}` : "—"
  const batteryText = data.batteryPercent == null
    ? "Indisponível"
    : `${data.batteryPercent}%`

  return (
    <Card className={cn("@container w-full min-w-0 max-w-[421px] gap-0 py-0", className)}>
      <CardHeader className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-3 pt-3 @min-[340px]:gap-3 @min-[340px]:px-5 @min-[340px]:pt-5 @min-[400px]:px-7 @min-[400px]:pt-7">
        <div className="min-w-0">
          <CardTitle className="flex min-w-0 items-center gap-1.5 text-[clamp(1rem,6cqw,1.875rem)] leading-tight font-normal @min-[340px]:gap-2 @min-[400px]:gap-3">
            <SatelliteDish aria-hidden="true" className="size-4 shrink-0 @min-[340px]:size-5 @min-[400px]:size-7" strokeWidth={2.4} />
            <span className="min-w-0 break-words">{data.nome ?? data.codigo}</span>
          </CardTitle>
          <p className="mt-1 break-all text-xs leading-4 text-muted-foreground @min-[340px]:text-sm @min-[400px]:text-base @min-[400px]:leading-5">
            {data.codigo}
          </p>
        </div>
        <span title={textoComunicacao[data.estado_comunicacao]}>
          <StatusIndicator
            status={data.estado_comunicacao}
            size="lg"
            className="size-5 @min-[340px]:size-6 @min-[400px]:size-8"
          />
        </span>
      </CardHeader>

      <CardContent className="flex min-w-0 flex-col px-3 pt-5 pb-4 @min-[340px]:px-5 @min-[340px]:pt-7 @min-[400px]:px-7 @min-[400px]:pt-10 @min-[400px]:pb-7">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 @min-[340px]:gap-x-5 @min-[400px]:gap-x-6 @min-[400px]:gap-y-4">
          <SignalStrengthIndicator
            rssiDbm={data.rssiDbm ?? null}
            isOnline={isOnline}
          />
          <div className="flex min-w-0 items-baseline gap-1 whitespace-nowrap text-card-foreground">
            <span className="text-[clamp(1.75rem,10cqw,2.8125rem)] leading-none font-normal tabular-nums">{rssiText}</span>
            <span className="text-xs @min-[340px]:text-sm @min-[400px]:text-base">dBm</span>
          </div>
        </div>

        <dl className="mt-5 space-y-1 text-xs leading-5 @min-[340px]:mt-6 @min-[340px]:text-sm @min-[400px]:mt-8 @min-[400px]:space-y-[7px] @min-[400px]:text-base @min-[400px]:leading-[23px]">
          <div className="flex flex-wrap gap-x-1">
            <dt className="font-bold">Status:</dt>
            <dd>{textoComunicacao[data.estado_comunicacao]}</dd>
          </div>
          <div className="flex flex-wrap gap-x-1">
            <dt className="font-bold">Bateria:</dt>
            <dd>{batteryText}</dd>
          </div>
          <div className="flex flex-wrap gap-x-1">
            <dt className="font-bold">Modelo:</dt>
            <dd className="break-words">{data.model ?? "—"}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
