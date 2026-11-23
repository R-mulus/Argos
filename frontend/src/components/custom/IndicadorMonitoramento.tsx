import type { LucideIcon } from "lucide-react"
import { TriangleAlert } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** Situação da consulta que alimenta o indicador; sem dados, nunca se mostra zero. */
export type EstadoIndicador = "pronto" | "carregando" | "erro"

export type IndicadorMonitoramentoProps = {
  titulo: string
  icone: LucideIcon
  /** Valor real; `null` quando ainda não há dado (carregando ou erro). */
  valor: number | null
  estado: EstadoIndicador
  /** Explica a origem ou o recorte do número (ex.: intervalo de recência). */
  descricao: string
  /** Destaca o card quando há ocorrências que pedem atenção. */
  atencao?: boolean
  /** "destaque" acompanha a altura do Animal em Destaque. */
  variante?: "resumo" | "destaque"
  className?: string
}

/** Card de indicador do monitoramento, no formato dos cards de resumo do Figma. */
export function IndicadorMonitoramento({
  titulo,
  icone: Icone,
  valor,
  estado,
  descricao,
  atencao = false,
  variante = "resumo",
  className,
}: IndicadorMonitoramentoProps) {
  const destaque = variante === "destaque"
  const comAtencao = atencao && estado === "pronto" && valor !== null && valor > 0
  return (
    <Card
      className={cn(
        "@container/card relative h-full w-full min-w-0 gap-0 overflow-hidden py-0",
        comAtencao && "ring-2! ring-primary!",
        className,
      )}
    >
      {comAtencao && (
        <span className="absolute top-0 right-0 flex items-center gap-1 rounded-bl-2xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
          <TriangleAlert aria-hidden="true" className="size-3.5" />
          Atenção
        </span>
      )}
      <CardHeader className={cn("px-3 pt-3 @min-[360px]:px-4 @min-[360px]:pt-4", destaque && "@min-[400px]:px-6 @min-[400px]:pt-6", comAtencao && "pr-24")}>
        <CardTitle className="flex min-w-0 items-start gap-2 text-base leading-tight font-normal @min-[300px]/card:text-lg @min-[400px]/card:text-2xl">
          <Icone aria-hidden="true" className="mt-0.5 size-4 shrink-0 @min-[300px]/card:size-5 @min-[400px]/card:size-6" />
          <h3 className="min-w-0 break-words">{titulo}</h3>
        </CardTitle>
      </CardHeader>

      <CardContent className={cn("flex min-h-[107px] min-w-0 flex-1 flex-col px-0 @min-[360px]:min-h-[152px]", destaque && "@min-[400px]:min-h-[212px]")}>
        {estado === "pronto" && valor !== null ? (
          <p className={cn(
            "mt-4 px-4 text-[32px] leading-none font-normal tracking-tight tabular-nums @min-[300px]:text-[38px] @min-[360px]:mt-6 @min-[360px]:px-12 @min-[400px]:text-[44px]",
            destaque && "@min-[400px]:mt-[60px] @min-[400px]:text-[64px]",
            comAtencao && "text-primary",
          )}>
            {valor.toLocaleString("pt-BR")}
          </p>
        ) : (
          <p
            role={estado === "erro" ? "alert" : "status"}
            className={cn("mt-4 px-4 text-sm @min-[360px]:mt-6 @min-[360px]:px-12", estado === "erro" ? "text-destructive" : "text-muted-foreground", destaque && "@min-[400px]:mt-[60px]")}
          >
            {estado === "erro" ? "Indisponível: falha ao consultar" : "Carregando…"}
          </p>
        )}
        <p className={cn("mt-auto px-3 pt-4 pb-3 text-xs leading-snug @min-[300px]:text-sm @min-[360px]:px-4 @min-[400px]:pb-4 @min-[400px]:text-base", destaque && "@min-[400px]:px-6 @min-[400px]:pb-9")}>
          {descricao}
        </p>
      </CardContent>
    </Card>
  )
}
