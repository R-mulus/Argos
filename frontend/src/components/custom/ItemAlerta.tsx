import type { Alerta } from "@argos/shared"
import { format } from "date-fns"
import { Ban, BatteryLow, CheckCheck, CircleCheck, RefreshCw, SatelliteDish, TriangleAlert, type LucideIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

const prioridades: Record<Alerta["prioridade"], { rotulo: string; aba: string; ponto: string }> = {
  critica: { rotulo: "Crítica", aba: "bg-destructive", ponto: "bg-destructive" },
  alta: { rotulo: "Alta", aba: "bg-primary", ponto: "bg-primary" },
  media: { rotulo: "Média", aba: "bg-[#C48135]", ponto: "bg-[#C48135]" },
  baixa: { rotulo: "Baixa", aba: "bg-secondary", ponto: "bg-secondary" },
}

const estados: Record<Alerta["estado"], { rotulo: string; classe: string }> = {
  novo: { rotulo: "Novo", classe: "border-primary text-primary" },
  lido: { rotulo: "Lido", classe: "border-border text-muted-foreground" },
  resolvido: { rotulo: "Resolvido", classe: "border-[#0AA146] text-[#0A7A37]" },
}

/** Rótulos dos tipos gerados pelo worker; outros tipos aparecem como "Aviso". */
const tipos: Record<string, { rotulo: string; icone: LucideIcon }> = {
  deteccao_rejeitada: { rotulo: "Leitura rejeitada", icone: Ban },
  sincronizacao_concluida: { rotulo: "Sincronização", icone: RefreshCw },
  bateria_baixa: { rotulo: "Bateria baixa", icone: BatteryLow },
  receptor_sem_leitura: { rotulo: "Receptor", icone: SatelliteDish },
}

function dataHora(valor: string | null) {
  if (!valor) return null
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? null : format(data, "dd/MM/yyyy HH:mm")
}

type ItemAlertaProps = {
  alerta: Alerta
  /** Ação em andamento para este aviso; bloqueia novos envios. */
  salvando?: "lido" | "resolvido" | null
  aoAtualizar: (estado: "lido" | "resolvido") => void
  className?: string
}

/** Aviso da central, com prioridade na aba lateral (padrão do CartaoAlerta) e ações de leitura e resolução. */
export function ItemAlerta({ alerta, salvando = null, aoAtualizar, className }: ItemAlertaProps) {
  const prioridade = prioridades[alerta.prioridade]
  const estado = estados[alerta.estado]
  const tipo = tipos[alerta.tipo] ?? { rotulo: "Aviso", icone: TriangleAlert }
  const Icone = tipo.icone
  const criado = dataHora(alerta.criado_em)
  const ocupado = salvando !== null

  return (
    <Card className={cn("@container relative w-full min-w-0 gap-0 overflow-hidden py-0", alerta.estado === "novo" && "ring-primary/60!", className)}>
      <span
        aria-hidden="true"
        className={cn("absolute top-0 left-0 flex size-12 items-center justify-center rounded-br-[24px] text-white @min-[360px]:size-16 @min-[640px]:size-[74px]", prioridade.aba)}
      >
        <Icone className="size-6 @min-[360px]:size-7 @min-[640px]:size-8" strokeWidth={2.2} />
      </span>

      <div className="min-w-0 px-3 py-3 pl-16 @min-[360px]:pl-20 @min-[640px]:py-5 @min-[640px]:pr-6 @min-[640px]:pl-[98px]">
        <div className="flex min-w-0 flex-col gap-1 @min-[650px]:flex-row @min-[650px]:items-start @min-[650px]:justify-between @min-[650px]:gap-4">
          <h3 className={cn("min-w-0 break-words text-base leading-snug @min-[360px]:text-lg @min-[640px]:text-2xl", alerta.estado === "novo" ? "font-medium" : "font-normal")}>
            {alerta.titulo}
          </h3>
          {criado && <time dateTime={alerta.criado_em} className="shrink-0 text-xs whitespace-nowrap text-muted-foreground @min-[650px]:pt-1 @min-[650px]:text-sm">{criado}</time>}
        </div>
        {alerta.descricao && <p className="mt-1 break-words text-sm leading-snug @min-[640px]:text-base">{alerta.descricao}</p>}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 @min-[640px]:mt-4">
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs @min-[640px]:text-sm">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Prioridade</dt>
              <span aria-hidden="true" className={cn("size-2.5 rounded-full", prioridade.ponto)} />
              <dd>Prioridade {prioridade.rotulo.toLowerCase()}</dd>
            </div>
            <div>
              <dt className="sr-only">Estado</dt>
              <dd className={cn("rounded-full border-2 px-2.5 py-0.5 font-medium", estado.classe)}>{estado.rotulo}</dd>
            </div>
            <div>
              <dt className="sr-only">Tipo</dt>
              <dd className="text-muted-foreground">{tipo.rotulo}</dd>
            </div>
            {alerta.estado === "resolvido" && dataHora(alerta.resolvido_em) && (
              <div className="flex items-center gap-1 text-[#0A7A37]">
                <dt className="sr-only">Resolvido em</dt>
                <CircleCheck aria-hidden="true" className="size-4" />
                <dd>Resolvido em {dataHora(alerta.resolvido_em)}</dd>
              </div>
            )}
          </dl>

          {alerta.estado !== "resolvido" && (
            <div className="flex flex-wrap gap-2">
              {alerta.estado === "novo" && (
                <Button variant="outline" disabled={ocupado} onClick={() => aoAtualizar("lido")} className="h-9 rounded-full border-2 px-4">
                  <CheckCheck aria-hidden="true" className="size-4" />
                  {salvando === "lido" ? "Salvando…" : "Marcar como lido"}
                </Button>
              )}
              <Button disabled={ocupado} onClick={() => aoAtualizar("resolvido")} className="h-9 rounded-full px-4 text-white">
                <CircleCheck aria-hidden="true" className="size-4" />
                {salvando === "resolvido" ? "Salvando…" : "Resolver"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
