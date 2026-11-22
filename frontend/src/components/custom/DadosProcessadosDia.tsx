import { ArrowUpRight, Camera } from "lucide-react"
import { useState } from "react"

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
  titulo?: string
  descricao?: string
  variante?: "resumo" | "detalhado"
  detalhes?: string
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
  titulo = "Dados Processados por dia",
  descricao,
  variante = "resumo",
  detalhes,
}: DadosProcessadosDiaProps) {
  const [aberto, setAberto] = useState(false)
  const detalhado = variante === "detalhado"
  return (
    // A altura mínima fica no conteúdo: uma container query não se aplica ao próprio container.
    <Card
      className={`@container/card relative w-full min-w-0 gap-0 overflow-hidden py-0 ${className}`}
    >
      {detalhes && <button type="button" aria-label={`Ver detalhes: ${titulo}`} aria-expanded={aberto} onClick={() => setAberto(!aberto)} className="absolute right-0 top-0 z-10 flex size-11 items-center justify-center rounded-bl-3xl bg-primary text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring @min-[400px]:size-[73px] @min-[400px]:rounded-bl-[26px]"><ArrowUpRight aria-hidden="true" className="@min-[400px]:size-9" strokeWidth={2.2} /></button>}
      <CardHeader className={`px-3 pt-3 @min-[360px]:px-4 @min-[360px]:pt-4 ${detalhado ? "@min-[400px]:px-6 @min-[400px]:pt-6" : ""} ${detalhes ? "pr-14! @min-[400px]:pr-24!" : ""}`}>
        <CardTitle className="flex min-w-0 items-start gap-2 font-normal leading-tight text-base @min-[300px]/card:text-lg @min-[400px]/card:text-2xl">
          <Camera
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 @min-[300px]/card:size-5 @min-[400px]/card:size-6"
          />
          <h3 className="min-w-0 break-words">{titulo}</h3>
        </CardTitle>
      </CardHeader>

      <CardContent className={`flex min-h-[107px] min-w-0 flex-1 flex-col px-0 @min-[360px]:min-h-[152px] ${detalhado ? "@min-[400px]:min-h-[212px]" : ""}`}>
        <p className={`mt-4 px-4 text-[32px] leading-none font-normal tracking-tight tabular-nums @min-[300px]:text-[38px] @min-[360px]:mt-6 @min-[360px]:px-12 @min-[400px]:text-[44px] ${detalhado ? "@min-[400px]:mt-[60px] @min-[400px]:text-[64px]" : ""}`}>
          {dados.quantidade.toLocaleString("pt-BR")}
          {detalhado && <span className="ml-3 text-lg font-light text-muted-foreground @min-[400px]:ml-5 @min-[400px]:text-4xl">Registros</span>}
        </p>
        <p className={`mt-auto px-3 pt-4 pb-3 text-xs leading-snug @min-[300px]:text-sm @min-[360px]:px-4 @min-[400px]:pb-4 @min-[400px]:text-base ${detalhado ? "@min-[400px]:px-6 @min-[400px]:pb-9" : ""}`}>
          {descricao ?? descreverIntervalo(dados.intervaloMinutos)}
        </p>
        {aberto && <p className="border-t px-4 py-3 text-sm text-muted-foreground">{detalhes}</p>}
      </CardContent>
    </Card>
  )
}
