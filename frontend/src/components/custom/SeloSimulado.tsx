import { cn } from "cn"

type SeloSimuladoProps = {
  className?: string
  /** Explicação exibida ao passar o cursor e lida por leitores de tela. */
  descricao?: string
}

/** Selo discreto para blocos com dados de demonstração, sem alterar a grade do Figma. */
export function SeloSimulado({
  className,
  descricao = "Dados simulados para demonstração; não representam medições do rebanho.",
}: SeloSimuladoProps) {
  return (
    <span
      title={descricao}
      className={cn(
        "pointer-events-auto inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] leading-4 font-medium text-muted-foreground",
        className
      )}
    >
      Simulado
      <span className="sr-only">: {descricao}</span>
    </span>
  )
}
