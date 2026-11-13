import type { ComunicacaoReceptor } from "@argos/shared"
import { ArrowUpRight, Camera } from "lucide-react"
import { Link } from "react-router"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusIndicator, textoComunicacao } from "@/components/custom/IndicadorStatus"

export type ReceptorData = ComunicacaoReceptor & {
  rssiDbm?: number | null
  model?: string | null
  batteryPercent?: number | null
  intervalMinutes?: number | null
  recordsPerDay?: number | null
  signalLosses?: number | null
}

type ReceptorCardProps = {
  data: ReceptorData
  detailsPath?: string
}

// Dados temporários; substituir por dados recebidos da API Argos.
export const receptorSimulado: ReceptorData = {
  id: "receptor-01",
  nome: "Receptor 01",
  status: "ativo",
  estado_comunicacao: "recente",
  codigo: "R01",
  ultima_comunicacao_em: "2026-09-19T16:19:00",
  rssiDbm: -60,
  model: "ESP32 C3",
  batteryPercent: 78,
  intervalMinutes: 30,
  recordsPerDay: 48,
  signalLosses: 2,
}

function formatLastUpdated(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Data indisponível"

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export function ReceptorCard({
  data,
  detailsPath,
}: ReceptorCardProps) {
  const metrics = [
    { label: "RSSI", value: data.rssiDbm == null ? "—" : `${data.rssiDbm} dBm` },
    { label: "Modelo", value: data.model ?? "—" },
    { label: "Bateria", value: data.batteryPercent == null ? "—" : `${data.batteryPercent}%` },
    { label: "Tempo de Intervalo", value: data.intervalMinutes == null ? "—" : `${data.intervalMinutes} min` },
    { label: "Registro Per/Dia", value: data.recordsPerDay?.toLocaleString("pt-BR") ?? "—" },
    { label: "Perdas de Sinal", value: data.signalLosses?.toLocaleString("pt-BR") ?? "—" },
  ]

  return (
    <Card className="@container relative w-full min-w-0 gap-0 overflow-hidden pt-3 pb-4 @min-[400px]:pt-4 @min-[760px]:pt-6 @min-[760px]:pb-5">
      <CardHeader className="min-h-10 px-3 pr-[54px] @min-[400px]:px-4 @min-[400px]:pr-[205px] @min-[700px]:px-6 @min-[700px]:pr-[330px]">
        <CardTitle className="flex min-w-0 items-center gap-1.5 text-base font-normal leading-snug @min-[400px]:gap-2 @min-[400px]:text-lg @min-[700px]:text-2xl">
          <Camera aria-hidden="true" className="size-4 shrink-0 @min-[400px]:size-5 @min-[700px]:size-6" />
          <span className="min-w-0 break-words">{data.nome ?? data.codigo}</span>
        </CardTitle>
      </CardHeader>

      <div className="absolute right-0 top-0 flex h-12 w-12 items-center justify-end gap-2 rounded-bl-2xl bg-primary px-2 text-white @min-[400px]:h-14 @min-[400px]:w-[190px] @min-[400px]:px-3 @min-[700px]:h-[74px] @min-[700px]:w-[min(40%,347px)] @min-[700px]:gap-3 @min-[700px]:rounded-bl-[26px] @min-[700px]:px-6">
        <div className="hidden min-w-0 text-[10px] leading-tight @min-[400px]:block @min-[700px]:text-[11px]">
          <div className="opacity-90">Última comunicação:</div>
          <time className="font-semibold" dateTime={data.ultima_comunicacao_em ?? undefined}>
            {data.ultima_comunicacao_em ? formatLastUpdated(data.ultima_comunicacao_em) : "—"}
          </time>
        </div>
        {detailsPath ? (
          <Link
            to={detailsPath}
            aria-label={`Ver detalhes de ${data.nome ?? data.codigo}`}
            title={`Ver detalhes de ${data.nome ?? data.codigo}`}
            className="shrink-0 rounded-md outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowUpRight aria-hidden="true" className="size-6 @min-[400px]:size-7 @min-[700px]:size-8" strokeWidth={2.5} />
          </Link>
        ) : (
          <ArrowUpRight aria-hidden="true" className="size-6 shrink-0 opacity-50 @min-[400px]:size-7 @min-[700px]:size-8" strokeWidth={2.5} />
        )}
      </div>

      <CardContent className="mt-3 px-3 @min-[400px]:mt-4 @min-[400px]:px-4 @min-[700px]:mt-5 @min-[700px]:px-6">
        <div className="flex items-center gap-1.5 text-xs @min-[400px]:gap-2 @min-[400px]:text-sm @min-[700px]:text-base">
          <StatusIndicator status={data.estado_comunicacao} />
          <span><strong>Status:</strong> {textoComunicacao[data.estado_comunicacao]}</span>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 @min-[360px]:grid-cols-2 @min-[400px]:mt-6 @min-[690px]:mt-9 @min-[690px]:grid-cols-3 @min-[690px]:gap-x-5 @min-[690px]:gap-y-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0">
              <dt className="text-xs leading-4 @min-[400px]:text-sm @min-[690px]:text-base @min-[690px]:leading-6">{metric.label}</dt>
              <dd className="mt-0.5 break-words text-lg font-semibold leading-tight @min-[400px]:text-xl @min-[690px]:text-[23px]">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 break-words text-xs leading-4 @min-[400px]:mt-6 @min-[400px]:text-sm @min-[690px]:mt-7 @min-[690px]:text-base">
          Cadastro do receptor: {data.status === "ativo" ? "ativo" : "inativo"}.
        </p>
      </CardContent>
    </Card>
  )
}
