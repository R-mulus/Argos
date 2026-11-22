import { ChevronDown } from "lucide-react"

import { SeletorIntervaloDatas } from "@/components/custom/SeletorIntervaloDatas"
import { SeletorPeriodo, type PeriodoVisualizacao } from "@/components/custom/SeletorPeriodo"
import type { IntervaloDatas } from "@/components/custom/CalendarioIntervalo"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

type CabecalhoZonaProps = {
  /** Texto antes do nome da zona, ex.: "Visão Geral" ou "Status Receptores". */
  titulo: string
  zonas: { id: string; nome: string; quantidade: number }[]
  zonaAtual: { id: string; nome: string } | null
  aoEscolherZona: (id: string) => void
  periodo: PeriodoVisualizacao
  aoMudarPeriodo: (periodo: PeriodoVisualizacao) => void
  intervalo: IntervaloDatas
  aoMudarIntervalo: (intervalo: IntervaloDatas | undefined) => void
}

/** Título com seletor de zona (padrão do Figma "Visão Geral - Curral 03 ⌄") e filtros de período. */
export function CabecalhoZona({ titulo, zonas, zonaAtual, aoEscolherZona, periodo, aoMudarPeriodo, intervalo, aoMudarIntervalo }: CabecalhoZonaProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 lg:mb-[54px]">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={zonas.length < 2}
          className="flex min-w-0 items-center gap-3 rounded-md text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default"
          aria-label="Escolher zona"
        >
          <h1 className="min-w-0 text-2xl leading-tight font-medium lg:text-[30px]">
            {titulo}{zonaAtual ? ` - ${zonaAtual.nome}` : ""}
          </h1>
          {zonas.length > 1 && <ChevronDown aria-hidden="true" className="size-6 shrink-0 lg:size-7" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {zonas.map(z => (
            <DropdownMenuItem key={z.id} onClick={() => aoEscolherZona(z.id)}>
              <span className="flex-1">{z.nome}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{z.quantidade}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
        <SeletorPeriodo value={periodo} onChange={aoMudarPeriodo} className="sm:w-[291px]" />
        <SeletorIntervaloDatas value={intervalo} onChange={aoMudarIntervalo} className="sm:w-[263px]" />
      </div>
    </div>
  )
}
