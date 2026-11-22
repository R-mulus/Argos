import { ResumoCurral, type AlertaCurral } from "@/components/custom/ResumoCurral"
import { SeloSimulado } from "@/components/custom/SeloSimulado"

type ResumoZonaProps = {
  nome: string
  animaisAtivos: number
  receptoresAtivos: number | null
  totalReceptores: number | null
  coleirasAtivas: number | null
  /** Intervalo médio entre leituras da zona no período; `null` enquanto carrega ou sem leituras. */
  intervaloMinutos: number | null
  animalDestaqueId?: string
  atualizadoEm: string
  alertas?: AlertaCurral[]
  aoAtualizar: () => Promise<void>
}

/**
 * Banner da zona (ResumoCurral do Figma) com os dados reais disponíveis.
 * O intervalo entre dados vem do histórico da zona; Precisão não tem fonte e fica simulada, com selo.
 */
export function ResumoZona({ nome, animaisAtivos, receptoresAtivos, totalReceptores, coleirasAtivas, intervaloMinutos, animalDestaqueId, atualizadoEm, alertas, aoAtualizar }: ResumoZonaProps) {
  return (
    <div className="relative">
      <ResumoCurral
        imagemFundo={`${import.meta.env.BASE_URL}lavoura.jpeg`}
        aoAtualizar={aoAtualizar}
        dados={{
          nome,
          animaisAtivos,
          receptoresAtivos: receptoresAtivos ?? undefined,
          totalReceptores: totalReceptores ?? undefined,
          coleirasAtivas: coleirasAtivas ?? undefined,
          intervaloDadosMinutos: intervaloMinutos,
          precisaoPercentual: 94.6,
          animalDestaqueId,
          ultimaAtualizacao: atualizadoEm,
          alertas,
        }}
      />
      <SeloSimulado
        className="absolute top-[68px] right-4 z-30 sm:top-auto sm:bottom-4"
        descricao="Precisão é simulada. O cadastro não tem nome de animal; os demais valores vêm da API."
      />
    </div>
  )
}
