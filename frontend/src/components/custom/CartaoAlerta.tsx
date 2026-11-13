import type { Alerta } from "@argos/shared"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowUpRight } from "lucide-react"
import { Link } from "react-router"

import { Card, CardContent } from "@/components/ui/card"

type DadosAlerta = Pick<Alerta, "id" | "titulo" | "descricao" | "criado_em">

type CartaoAlertaProps = {
  data: DadosAlerta | null
  detailsPath?: string
  className?: string
}

export const alertaSimulado: DadosAlerta = {
  id: "alerta-01",
  titulo: "Alerta de Vaca Atolada",
  descricao: "A vaca atolou mano! vai lá desatolar a coitada.",
  criado_em: "2026-09-30T08:45:00",
}

export function CartaoAlerta({
  data,
  detailsPath = "/alertas",
  className = "",
}: CartaoAlertaProps) {
  const dataAlerta = data && parseISO(data.criado_em)
  const dataValida = dataAlerta && !Number.isNaN(dataAlerta.getTime())

  return (
    <Card
      className={`@container relative min-h-28 w-full min-w-0 gap-0 overflow-hidden py-0 @min-[460px]:min-h-[126px] ${className}`}
    >
      <Link
        to={detailsPath}
        aria-label="Abrir página de alertas"
        className="absolute top-0 left-0 z-10 flex size-12 items-center justify-center rounded-br-[24px] bg-primary text-white transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring @min-[360px]:size-16 @min-[640px]:size-[74px]"
      >
        <ArrowUpRight aria-hidden="true" className="size-7 @min-[360px]:size-9 @min-[640px]:size-11" strokeWidth={2.4} />
      </Link>

      <CardContent className="min-w-0 px-3 py-3 pl-16 @min-[360px]:pl-20 @min-[640px]:py-4 @min-[640px]:pl-[88px]">
        <div className="flex min-w-0 flex-col gap-1 @min-[650px]:flex-row @min-[650px]:items-start @min-[650px]:justify-between @min-[650px]:gap-4">
          <div className="min-w-0">
            <h3 className="break-words text-base leading-snug font-normal @min-[360px]:text-lg @min-[640px]:text-2xl">
              {data?.titulo ?? "Nenhum alerta no momento."}
            </h3>
            <p className="mt-1 break-words text-xs leading-snug @min-[360px]:text-sm @min-[640px]:text-base">
              {data?.descricao}
            </p>
          </div>
          {data && dataValida && (
            <time
              dateTime={data.criado_em}
              className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground @min-[400px]:text-xs @min-[650px]:pt-0.5 @min-[650px]:text-sm"
            >
              {format(dataAlerta, "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </time>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export type { DadosAlerta, CartaoAlertaProps }
