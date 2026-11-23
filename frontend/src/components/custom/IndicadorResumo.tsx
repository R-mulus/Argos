import type { ComponentType } from "react"
import { cn } from "cn"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type TomIndicador = "primario" | "critico" | "secundario" | "sucesso"

// Aba colorida no padrão dos cards do Figma (Temperatura Média, Dados Processados).
const corAba: Record<TomIndicador, string> = {
  primario: "bg-primary",
  critico: "bg-destructive",
  secundario: "bg-secondary",
  sucesso: "bg-[#0AA146]",
}

type IndicadorResumoProps = {
  titulo: string
  /** `null` enquanto a contagem não foi carregada. */
  valor: number | null
  descricao: string
  tom: TomIndicador
  icone: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>
  className?: string
}

/** Card-resumo com número e aba colorida, na composição dos indicadores da tela inicial (Alertas, Perfil). */
export function IndicadorResumo({ titulo, valor, descricao, tom, icone: Icone, className }: IndicadorResumoProps) {
  return (
    <Card className={cn("@container relative w-full min-w-0 gap-0 overflow-hidden py-0", className)}>
      <div aria-hidden="true" className={cn("absolute top-0 right-0 h-6 w-1/4 rounded-bl-[18px] @min-[360px]:h-8 @min-[360px]:w-[28%]", corAba[tom])} />
      <CardHeader className="relative px-3 pt-3 pr-[27%] @min-[360px]:px-4 @min-[360px]:pt-3.5 @min-[360px]:pr-[30%]">
        <CardTitle className="flex min-w-0 items-start gap-2 text-sm leading-tight font-normal @min-[300px]:text-base @min-[400px]:text-lg">
          <Icone aria-hidden="true" className="mt-0.5 size-4 shrink-0 @min-[400px]:size-5" />
          <h2 className="min-w-0 break-words">{titulo}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-[84px] min-w-0 flex-1 flex-col px-0 @min-[360px]:min-h-[100px]">
        <p className="mt-2 px-4 text-[28px] leading-none tracking-tight tabular-nums @min-[300px]:text-[32px] @min-[360px]:mt-3 @min-[360px]:px-10 @min-[400px]:text-[36px]">
          {valor == null ? "—" : valor.toLocaleString("pt-BR")}
        </p>
        <p className="mt-auto px-3 pt-2.5 pb-3 text-xs leading-snug @min-[360px]:px-4 @min-[400px]:text-[13px]">{descricao}</p>
      </CardContent>
    </Card>
  )
}
