import { useState } from "react"
import { Camera, RefreshCw } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export type PrioridadeAlerta = "baixa" | "media" | "alta" | "critica"

export interface AlertaCurral {
  id: string
  mensagem: string
  criadoEm: string
  prioridade?: PrioridadeAlerta
}

export interface DadosResumoCurral {
  nome: string
  animaisAtivos: number
  receptoresAtivos: number
  totalReceptores: number
  coleirasAtivas: number
  /** Intervalo médio entre leituras; `null` sem leituras suficientes. */
  intervaloDadosMinutos: number | null
  precisaoPercentual: number
  animalDestaqueId: string
  animalDestaqueNome: string
  ultimaAtualizacao: string
  alertas: AlertaCurral[]
}

export interface ResumoCurralProps {
  /** Dados recebidos de uma API ou fornecidos pela página. */
  dados: Partial<DadosResumoCurral>
  /** Caminho da imagem na pasta public ou URL; permite reutilizar o card em outros currais. */
  imagemFundo?: string
  /** Quando conectado à API, deve buscar novamente os dados no componente pai. */
  aoAtualizar?: () => void | Promise<void>
  className?: string
}

export const curralSimulado: DadosResumoCurral = {
  nome: "Curral 03",
  animaisAtivos: 36,
  receptoresAtivos: 3,
  totalReceptores: 3,
  coleirasAtivas: 36,
  intervaloDadosMinutos: 38,
  precisaoPercentual: 94.6,
  animalDestaqueId: "ARG-2103",
  animalDestaqueNome: "Santana",
  ultimaAtualizacao: "2026-09-19T16:19:00",
  alertas: [
    {
      id: "alerta-exemplo",
      mensagem: "As coisas estão dando errado.",
      criadoEm: "2026-09-19T16:10:00",
      prioridade: "alta",
    },
  ],
}

const ordemPrioridade: Record<PrioridadeAlerta, number> = {
  baixa: 0,
  media: 1,
  alta: 2,
  critica: 3,
}

const formatoNumero = new Intl.NumberFormat("pt-BR")

function formatarIntervalo(minutos: number | null | undefined): string {
  if (minutos == null) return "—"
  if (minutos < 1) return "< 1 min"
  if (minutos < 60) return `${Math.round(minutos)} min`
  const horas = Math.floor(minutos / 60)
  const resto = Math.round(minutos % 60)
  return resto ? `${horas} h ${resto} min` : `${horas} h`
}

function formatarUltimaAtualizacao(valor: string): string {
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return valor
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function escolherAlertaPrioritario(alertas: AlertaCurral[]): AlertaCurral | undefined {
  // Se todas as prioridades forem iguais (ou não existirem), vence o mais recente.
  return [...alertas].sort((a, b) => {
    const prioridadeA = a.prioridade ? ordemPrioridade[a.prioridade] : 0
    const prioridadeB = b.prioridade ? ordemPrioridade[b.prioridade] : 0
    if (prioridadeA !== prioridadeB) return prioridadeB - prioridadeA

    const dataA = Date.parse(a.criadoEm)
    const dataB = Date.parse(b.criadoEm)
    return (Number.isNaN(dataB) ? 0 : dataB) - (Number.isNaN(dataA) ? 0 : dataA)
  })[0]
}

export function ResumoCurral({
  dados,
  imagemFundo = "./lavoura.jpeg", // Ajuste para a imagem existente no projeto.
  aoAtualizar,
  className,
}: ResumoCurralProps) {
  const [atualizando, setAtualizando] = useState(false)
  const [erroAtualizacao, setErroAtualizacao] = useState(false)

  const curral = dados
  const alerta = escolherAlertaPrioritario(curral.alertas ?? [])
  const ultimaAtualizacao = curral.ultimaAtualizacao

  async function atualizarDados() {
    if (atualizando) return
    setAtualizando(true)
    setErroAtualizacao(false)

    try {
      await aoAtualizar?.()
    } catch {
      setErroAtualizacao(true)
    } finally {
      setAtualizando(false)
    }
  }

  return (
    <Card
      aria-label={`Resumo do ${curral.nome ?? "Curral"}`}
      className={cn(
        "@container relative isolate w-full min-w-0 gap-0! overflow-hidden bg-secondary py-0! text-white ring-1 ring-foreground/10",
        className
      )}
    >
      {/* A imagem é configurável; a camada escura garante leitura sobre fotos claras. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: `url(${JSON.stringify(imagemFundo)})` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-black/60 via-black/35 to-black/15"
      />

      {/* Faixa de atualização: ocupa o topo no card estreito e o canto direito no largo. */}
      <div className="absolute inset-x-0 top-0 z-20 flex min-h-14 items-center justify-end gap-3 rounded-bl-[22px] bg-primary px-4 py-2 @min-[680px]:inset-x-auto @min-[680px]:right-0 @min-[680px]:min-h-[70px] @min-[680px]:w-[40%] @min-[680px]:px-5">
        <div className="min-w-0 text-right text-[10px] leading-tight text-white @min-[680px]:text-xs">
          <span className="block">Última Atualização:</span>
          <time className="font-semibold" dateTime={ultimaAtualizacao}>
            {ultimaAtualizacao ? formatarUltimaAtualizacao(ultimaAtualizacao) : "—"}
          </time>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={atualizando || !aoAtualizar}
          onClick={atualizarDados}
          aria-label={atualizando ? "Atualizando informações do curral" : "Atualizar informações do curral"}
          title="Atualizar dados"
          className="size-8 shrink-0 rounded-xl! bg-white text-primary hover:bg-white/90 hover:text-primary focus-visible:ring-white @min-[680px]:size-10"
        >
          <RefreshCw aria-hidden="true" className={cn("size-4 @min-[680px]:size-5", atualizando && "motion-safe:animate-spin")} />
        </Button>
      </div>

      <CardContent className="relative z-10 flex min-h-[315px] flex-col gap-0 px-4 pb-5 pt-[78px] @min-[480px]:px-5 @min-[680px]:min-h-[350px] @min-[680px]:px-7 @min-[680px]:pb-7 @min-[680px]:pt-7 @min-[1100px]:min-h-[384px] @min-[1100px]:px-[30px] @min-[1100px]:pb-[50px]">
        <header className="flex min-w-0 items-center gap-2 @min-[680px]:max-w-[57%]">
          <Camera aria-hidden="true" className="size-5 shrink-0 @min-[680px]:size-7" />
          <h2 className="min-w-0 truncate text-xl leading-tight font-semibold @min-[440px]:text-2xl @min-[900px]:text-[30px]">
            {curral.nome ?? "Curral"}
          </h2>
        </header>

        {/* Grade do Figma: número com recuo e três colunas agrupadas à esquerda (176/177/317 px em 1920 px). */}
        <dl className="mt-6 grid min-w-0 grid-cols-2 gap-x-4 gap-y-5 @min-[560px]:grid-cols-[minmax(96px,auto)_repeat(3,minmax(0,1fr))] @min-[560px]:gap-x-6 @min-[1100px]:mt-[30px] @min-[1100px]:grid-cols-[176px_177px_317px_minmax(0,1fr)] @min-[1100px]:gap-x-0 @min-[1100px]:gap-y-[28px]">
          <div className="col-span-2 min-w-0 @min-[560px]:col-span-1 @min-[560px]:row-span-2 @min-[1100px]:pl-[44px]">
            <dd className="text-[clamp(2.6rem,8cqw,4.1rem)] leading-none font-normal tabular-nums">
              {curral.animaisAtivos == null ? "—" : formatoNumero.format(curral.animaisAtivos)}
            </dd>
            <dt className="mt-1 text-xs @min-[680px]:text-sm @min-[900px]:text-base">Animais Ativos</dt>
          </div>
          {[
            ["Receptores Ativos", `${curral.receptoresAtivos ?? "—"}/${curral.totalReceptores ?? "—"}`],
            ["Intervalo entre dados", formatarIntervalo(curral.intervaloDadosMinutos)],
            ["Animal em Destaque", curral.animalDestaqueId ?? "—"],
            ["Coleiras Ativas", curral.coleirasAtivas == null ? "—" : formatoNumero.format(curral.coleirasAtivas)],
            ["Precisão", curral.precisaoPercentual == null ? "—" : `${curral.precisaoPercentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`],
            ["Nome", curral.animalDestaqueNome ?? "—"],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="min-w-0">
              <dt className="text-xs leading-snug @min-[900px]:text-base">{rotulo}</dt>
              <dd className="mt-1 break-words text-lg leading-tight font-semibold tabular-nums @min-[900px]:text-2xl">{valor}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-auto pt-7 @min-[780px]:pt-8">
          <div className="w-full rounded-lg border border-white/35 bg-white/20 px-3 py-3 text-xs leading-relaxed backdrop-blur-sm @min-[500px]:px-4 @min-[500px]:text-sm @min-[1100px]:max-w-[59.5%] @min-[1100px]:py-[25px]">
            <span className="mr-1 font-semibold">Alerta Prioritário:</span>
            <span>{alerta?.mensagem ?? (curral.alertas ? "Nenhum alerta no momento." : "Indisponível")}</span>
          </div>
          {erroAtualizacao && (
            <p role="alert" className="mt-2 text-xs text-white">
              Não foi possível atualizar os dados. Tente novamente.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
