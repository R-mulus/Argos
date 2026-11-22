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
      <div aria-hidden="true" className={cn("absolute top-0 right-0 h-7 w-1/4 rounded-bl-[24px] @min-[360px]:h-[38px] @min-[360px]:w-[30%]", corAba[tom])} />
      <CardHeader className="relative px-3 pt-3 pr-[27%] @min-[360px]:px-4 @min-[360px]:pt-4 @min-[360px]:pr-[32%]">
        <CardTitle className="flex min-w-0 items-start gap-2 text-base leading-tight font-normal @min-[300px]:text-lg @min-[400px]:text-2xl">
          <Icone aria-hidden="true" className="mt-0.5 size-4 shrink-0 @min-[300px]:size-5 @min-[400px]:size-6" />
          <h2 className="min-w-0 break-words">{titulo}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-[107px] min-w-0 flex-1 flex-col px-0 @min-[360px]:min-h-[152px]">
        <p className="mt-4 px-4 text-[32px] leading-none tracking-tight tabular-nums @min-[300px]:text-[38px] @min-[360px]:mt-6 @min-[360px]:px-12 @min-[400px]:text-[44px]">
          {valor == null ? "—" : valor.toLocaleString("pt-BR")}
        </p>
        <p className="mt-auto px-3 pt-4 pb-3 text-xs leading-snug @min-[300px]:text-sm @min-[360px]:px-4 @min-[400px]:pb-4 @min-[400px]:text-base">{descricao}</p>
      </CardContent>
    </Card>
  )
}
