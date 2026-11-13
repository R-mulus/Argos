import type { ComunicacaoReceptor } from "@argos/shared"
import { cn } from "cn"

export type ReceptorStatus = ComunicacaoReceptor["estado_comunicacao"]

export const textoComunicacao: Record<ReceptorStatus, string> = {
  recente: "Comunicação recente",
  sem_leitura_recente: "Sem leitura recente",
  aguardando_primeira_leitura: "Aguardando primeira leitura",
}

type StatusIndicatorProps = {
  status: ReceptorStatus
  withHalo?: boolean
  className?: string
  /** `lg` reproduz o ponto de 32px do card compacto. */
  size?: "sm" | "lg"
}

export function StatusIndicator({
  status,
  className,
  withHalo = false,
  size = "sm",
}: StatusIndicatorProps) {
  const isOnline = status === "recente"
  const dotColor = isOnline ? "bg-emerald-600" : "bg-zinc-400"
  const large = size === "lg"

  if (withHalo) {
    return (
      <span
        aria-hidden="true"
        className={cn(`inline-flex shrink-0 items-center justify-center rounded-full ${large ? "size-12" : "size-9"} ${isOnline ? "bg-emerald-100" : "bg-zinc-200"}`, className)}
      >
        <span className={`rounded-full ${large ? "size-8" : "size-6"} ${dotColor}`} />
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(`inline-block shrink-0 rounded-full ${large ? "size-8" : "size-5"} ${dotColor}`, className)}
    />
  )
}
