import { Camera } from "lucide-react"
import { Link } from "react-router"
import { cn } from "cn"

import { Card } from "@/components/ui/card"

export type CartaoZonaDados = {
  nome: string
  /** Animais com detecção nos últimos 5 minutos atribuídos à zona (contagem reconciliada). */
  animaisAtivos: number
  /** Receptores da zona com comunicação recente; `null` enquanto indisponível. */
  receptoresAtivos: number | null
  totalReceptores: number | null
  /** Coleiras vinculadas detectadas na zona nos últimos 5 minutos. */
  coleirasAtivas: number | null
}

const formatar = (valor: number | null) => (valor == null ? "—" : valor.toLocaleString("pt-BR"))

/** `destino`, quando informado, torna o card inteiro um link (ex.: detalhe da zona em Animais). */
export function CartaoZona({ dados, destino, className }: { dados: CartaoZonaDados; destino?: string; className?: string }) {
  const receptores =
    dados.receptoresAtivos == null || dados.totalReceptores == null
      ? "—"
      : `${dados.receptoresAtivos}/${dados.totalReceptores}`

  return (
    <Card className={cn("@container relative h-full min-w-0 gap-0 py-0", destino && "transition-shadow has-[a:hover]:shadow-md", className)}>
      {destino && (
        <Link
          to={destino}
          aria-label={`Ver detalhes de ${dados.nome}`}
          className="absolute inset-0 z-20 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      )}
      <div aria-hidden="true" className="absolute top-0 right-0 h-10 w-[37%] rounded-bl-[22px] bg-primary @min-[380px]:h-[52px] @min-[380px]:rounded-bl-[26px]" />

      {/* Altura do Figma (384 px) no conteúdo; nomes longos ocupam o espaço do meio antes de aumentar o card. */}
      <div className="flex h-full min-h-72 min-w-0 flex-col px-4 pt-5 pb-5 @min-[380px]:min-h-[384px] @min-[380px]:px-[30px] @min-[380px]:pt-[27px] @min-[380px]:pb-[30px]">
        <h3 className="flex min-w-0 items-start gap-2.5 pr-[calc(37cqw-12px)] text-xl leading-tight font-normal @min-[380px]:pr-[calc(37cqw-22px)] @min-[380px]:text-[30px]">
          <Camera aria-hidden="true" className="mt-[3px] size-5 shrink-0 @min-[380px]:mt-[6px] @min-[380px]:size-[26px]" />
          <span className="min-w-0 break-words">{dados.nome}</span>
        </h3>

        <div className="relative mt-3 flex min-h-28 flex-1 items-start @min-[380px]:mt-6 @min-[380px]:min-h-[120px]">
          <p className="relative z-10 pt-3 @min-[380px]:pt-[29px]" title="Animais detectados nesta zona nos últimos 5 minutos">
            <span className="block text-5xl leading-none tabular-nums @min-[380px]:text-[64px]">{formatar(dados.animaisAtivos)}</span>
            <span className="mt-1.5 block text-sm @min-[380px]:text-base">Animais Ativos</span>
          </p>
          <img
            src={`${import.meta.env.BASE_URL}curral.svg`}
            alt=""
            className="absolute -right-4 bottom-0 w-[62%] max-w-[252px] @min-[380px]:-right-[30px] @min-[380px]:bottom-3"
          />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t-[3px] border-foreground/20 pt-5 @min-[380px]:mt-[23px] @min-[380px]:pt-[30px]">
          <div title="Receptores da zona com comunicação nos últimos 5 minutos">
            <dt className="text-xs @min-[380px]:text-[15px]">Receptores Ativos</dt>
            <dd className="mt-0.5 text-lg leading-tight font-semibold tabular-nums @min-[380px]:text-[22px]">{receptores}</dd>
          </div>
          <div title="Coleiras vinculadas detectadas nesta zona nos últimos 5 minutos">
            <dt className="text-xs @min-[380px]:text-[15px]">Coleiras Ativas</dt>
            <dd className="mt-0.5 text-lg leading-tight font-semibold tabular-nums @min-[380px]:text-[22px]">{formatar(dados.coleirasAtivas)}</dd>
          </div>
        </dl>
      </div>
    </Card>
  )
}
