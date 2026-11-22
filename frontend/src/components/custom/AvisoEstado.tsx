import type { ReactNode } from "react"
import { Link } from "react-router"
import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * atencao: configuração ausente ou nenhuma leitura disponível.
 * erro: falha efetiva de consulta ou comunicação.
 * informacao: dados ainda não gerados, sem indicar falha.
 */
export type TomAviso = "atencao" | "erro" | "informacao"

/** Ação que o próprio usuário pode tomar para resolver a situação: um destino da aplicação ou um clique. */
export type AcaoAviso =
  | { rotulo: string; destino: string }
  | { rotulo: string; aoClicar: () => void; desabilitada?: boolean }

const estilos: Record<TomAviso, { caixa: string; icone: string; Icone: LucideIcon }> = {
  atencao: { caixa: "border-primary/45 bg-primary/8", icone: "text-primary", Icone: TriangleAlert },
  erro: { caixa: "border-destructive/45 bg-destructive/8", icone: "text-destructive", Icone: CircleAlert },
  informacao: { caixa: "border-secondary/30 bg-secondary/6", icone: "text-secondary", Icone: Info },
}

type AvisoEstadoProps = {
  tom: TomAviso
  titulo: string
  children?: ReactNode
  acao?: AcaoAviso
  className?: string
}

/** Aviso de ausência de dados, de configuração ou de erro, com ação opcional. */
export function AvisoEstado({ tom, titulo, children, acao, className }: AvisoEstadoProps) {
  const { caixa, icone, Icone } = estilos[tom]
  const botao = cn(buttonVariants({ variant: tom === "erro" ? "outline" : "default" }), "shrink-0 self-start sm:self-center")
  return (
    <div
      role={tom === "erro" ? "alert" : "status"}
      className={cn("flex min-w-0 flex-col gap-4 rounded-xl border-2 px-4 py-4 text-foreground sm:flex-row sm:items-center sm:px-5", caixa, className)}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icone aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", icone)} />
        <div className="min-w-0">
          <p className="font-medium leading-snug">{titulo}</p>
          {children && <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</div>}
        </div>
      </div>
      {acao && ("destino" in acao
        ? <Link to={acao.destino} className={botao}>{acao.rotulo}</Link>
        : <button type="button" className={botao} disabled={acao.desabilitada} onClick={acao.aoClicar}>{acao.rotulo}</button>)}
    </div>
  )
}
