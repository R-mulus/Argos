import { Camera } from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type DadosProcessadosDiaDados = {
  quantidade: number
  intervaloMinutos: number
}

export type DadosProcessadosDiaProps = {
  /** Dados recebidos da API. Na ausência deles, utiliza os valores do Figma. */
  dados?: DadosProcessadosDiaDados
  className?: string
}

const dadosSimulados: DadosProcessadosDiaDados = {
  quantidade: 25,
  intervaloMinutos: 60,
}

function descreverIntervalo(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= 0) {
    return "Intervalo de registro indisponível"
  }

  if (minutos % 60 === 0) {
    const horas = minutos / 60
    return `Intervalo de ${horas} ${horas === 1 ? "hora" : "horas"} por registro`
  }

  return `Intervalo de ${minutos} ${minutos === 1 ? "minuto" : "minutos"} por registro`
}

export function DadosProcessadosDia({
  dados = dadosSimulados,
  className = "",
}: DadosProcessadosDiaProps) {
  return (
    <Card
      className={`@container w-full min-w-0 min-h-[155px] gap-0 overflow-hidden py-0 @min-[360px]:min-h-[200px] ${className}`}
    >
      <CardHeader className="px-3 pt-3 @min-[360px]:px-4 @min-[360px]:pt-4">
        <CardTitle className="flex min-w-0 items-start gap-2 font-normal leading-tight text-base @min-[300px]:text-lg @min-[400px]:text-2xl">
          <Camera
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 @min-[300px]:size-5 @min-[400px]:size-6"
          />
          <h3 className="min-w-0 break-words">Dados Processados por dia</h3>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex min-w-0 flex-1 flex-col px-0">
        <p className="mt-4 px-4 text-[32px] leading-none font-normal tracking-tight tabular-nums @min-[300px]:text-[38px] @min-[360px]:mt-6 @min-[360px]:px-12 @min-[400px]:text-[44px]">
          {dados.quantidade.toLocaleString("pt-BR")}
        </p>
        <p className="mt-auto px-3 pt-4 pb-3 text-xs leading-snug @min-[300px]:text-sm @min-[360px]:px-4 @min-[400px]:pb-4 @min-[400px]:text-base">
          {descreverIntervalo(dados.intervaloMinutos)}
        </p>
      </CardContent>
    </Card>
  )
}
