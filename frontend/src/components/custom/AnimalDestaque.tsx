import { format } from "date-fns"
import { ArrowUpRight, Camera } from "lucide-react"
import { Link } from "react-router"
import { cn } from "cn"

import { Card } from "@/components/ui/card"
import { SeloSimulado } from "@/components/custom/SeloSimulado"
import { formatarIdade } from "@/lib/formatos"

export type AnimalDestaqueDados = {
  identificacao: string
  /** Instante de referência da última detecção (ESP32 ou gateway). */
  ultimaDeteccaoEm: string | null
  /** Data de nascimento no formato AAAA-MM-DD. */
  dataNascimento: string | null
  sexo: "macho" | "femea" | null
  raca: string | null
  /** Última pesagem manual registrada. */
  pesoKg: number | null
}

type AnimalDestaqueProps = {
  /** `null` quando nenhum animal tem detecção registrada. */
  dados: AnimalDestaqueDados | null
  /** Horário em que o resumo do monitoramento foi calculado. */
  atualizadoEm?: string
  carregando?: boolean
  /** Rota aberta pela seta da aba; `null` deixa a seta apenas decorativa. */
  destino?: string | null
  className?: string
}

// Liderança, movimento e distância dependem do futuro modelo de ML; a distância
// não é calculada pelo RSSI. Valores fixos do Figma, marcados como simulados.
const metricasSimuladas = [
  ["Acurácia de Liderança", "78%"],
  ["Tempo em Movimento", "2 h 45 min"],
  ["Distância Percorrida", "3,8 km"],
] as const

function formatarDataHora(valor: string | null | undefined) {
  if (!valor) return "—"
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? "—" : format(data, "dd/MM/yyyy HH:mm")
}

const textoSexo = { macho: "Macho", femea: "Fêmea" } as const

export function AnimalDestaque({
  dados,
  atualizadoEm,
  carregando = false,
  destino = "/animals",
  className,
}: AnimalDestaqueProps) {
  const campos = dados
    ? [
        ["Idade", formatarIdade(dados.dataNascimento)],
        ["Sexo", dados.sexo ? textoSexo[dados.sexo] : "—"],
        ["Raça", dados.raca ?? "—"],
        ["Peso", dados.pesoKg == null ? "—" : `${dados.pesoKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`],
      ]
    : []

  return (
    <Card
      aria-busy={carregando}
      className={cn("@container relative h-full min-w-0 gap-0 py-0", className)}
    >
      {/* Aba laranja do Figma com o horário do cálculo e o acesso aos animais. */}
      <div className="absolute top-0 right-0 flex h-14 w-[46%] items-center justify-end gap-3 rounded-bl-[28px] bg-primary pr-3 pl-4 text-white @min-[600px]:h-[73px] @min-[600px]:w-[39.4%] @min-[600px]:gap-4 @min-[600px]:rounded-bl-[36px] @min-[600px]:pr-5">
        <p className="min-w-0 text-right text-[10px] leading-tight @min-[600px]:text-[11px]">
          <span className="block opacity-75">Última Atualização:</span>
          <time className="font-semibold" dateTime={atualizadoEm}>{formatarDataHora(atualizadoEm)}</time>
        </p>
        {destino ? (
          <Link
            to={destino}
            aria-label="Ver animais"
            className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ArrowUpRight aria-hidden="true" className="size-7 @min-[600px]:size-9" strokeWidth={2.2} />
          </Link>
        ) : (
          <ArrowUpRight aria-hidden="true" className="size-7 shrink-0 @min-[600px]:size-9" strokeWidth={2.2} />
        )}
      </div>

      <div className="flex h-full min-w-0 flex-col px-4 pt-[72px] pb-5 @min-[600px]:px-[30px] @min-[600px]:pt-0 @min-[600px]:pb-[47px]">
        <h2 className="flex items-center gap-2.5 text-xl leading-tight font-normal @min-[600px]:h-[73px] @min-[600px]:pr-[42%] @min-[600px]:text-[30px]">
          <Camera aria-hidden="true" className="size-5 shrink-0 @min-[600px]:size-[26px]" />
          Animal em Destaque
        </h2>

        <div className="mt-5 grid min-w-0 flex-1 items-start gap-6 @min-[600px]:mt-[34px] @min-[600px]:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] @min-[600px]:gap-8 @min-[820px]:grid-cols-[295px_minmax(0,1fr)] @min-[820px]:gap-[65px]">
          <img
            src={`${import.meta.env.BASE_URL}animal-destaque.png`}
            alt=""
            className="mx-auto w-full max-w-60 object-contain @min-[600px]:mt-1 @min-[600px]:max-w-none"
          />

          {carregando ? (
            <p role="status" className="self-center text-muted-foreground">Carregando o animal em destaque…</p>
          ) : !dados ? (
            <p className="self-center text-muted-foreground">Nenhum animal detectado até o momento.</p>
          ) : (
            <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-5 @min-[600px]:gap-x-6 @min-[600px]:gap-y-[26px]">
              <div className="min-w-0">
                <dt className="text-xs @min-[600px]:text-[15px]">ID Animal</dt>
                <dd className="mt-0.5 break-words text-2xl leading-tight font-semibold @min-[600px]:text-[28px] @min-[820px]:text-[36px]">{dados.identificacao}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs @min-[600px]:text-[15px]">Última Detecção</dt>
                <dd className="mt-0.5 text-lg leading-tight font-semibold @min-[600px]:text-[20px] @min-[820px]:text-[24px]">
                  <time dateTime={dados.ultimaDeteccaoEm ?? undefined}>{formatarDataHora(dados.ultimaDeteccaoEm)}</time>
                </dd>
              </div>
              {campos.map(([nome, valor], i) => (
                <div key={nome} className={cn("min-w-0", i < 2 && "@min-[600px]:mt-[37px]")}>
                  <dt className="text-xs @min-[600px]:text-[15px]">{nome}</dt>
                  <dd className="mt-0.5 break-words text-lg leading-tight font-semibold @min-[600px]:text-[24px]">{valor}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="relative mt-6 rounded-lg border-2 border-foreground/25 px-4 py-3 @min-[600px]:mt-8 @min-[600px]:px-5 @min-[600px]:py-[18px] @min-[820px]:px-[38px]">
          <SeloSimulado
            className="absolute -top-3 right-3 bg-card"
            descricao="Liderança, movimento e distância são simulados: dependem do futuro modelo de análise. A distância não é calculada pelo RSSI."
          />
          <dl className="grid gap-3 @min-[480px]:grid-cols-[1.1fr_1fr_0.75fr]">
            {metricasSimuladas.map(([nome, valor]) => (
              <div key={nome} className="min-w-0">
                <dt className="text-xs @min-[600px]:text-[15px]">{nome}</dt>
                <dd className="mt-0.5 text-lg leading-tight font-semibold @min-[600px]:text-[22px]">{valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Card>
  )
}
