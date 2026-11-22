import { cn } from "cn"

export type TomStatus = "ativo" | "inativo" | "alerta" | "neutro"

const tons: Record<TomStatus, string> = {
  ativo: "border-[#0AA146] text-[#0A7A37]",
  inativo: "border-border text-muted-foreground",
  alerta: "border-primary text-primary",
  neutro: "border-secondary/40 text-secondary",
}

/** Etiqueta de situação em pílula, no padrão dos estados da Central de Alertas. */
export function SeloStatus({ tom, children, className }: { tom: TomStatus; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border-2 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tons[tom], className)}>
      {children}
    </span>
  )
}
