import { useState } from "react"
import { Icon } from "lucide-react"
import { LocateFixed, Minus, Plus, SatelliteDish } from "lucide-react"
import { cowHead } from "@lucide/lab"
import { cn } from "cn"

import { SeloSimulado } from "@/components/custom/SeloSimulado"

type MapaIlustrativoZonaProps = {
  nomeZona: string
  /** Animais detectados na zona nos últimos 5 minutos (dado real exibido no marcador). */
  animaisNaZona: number | null
  /** Quando informado, o marcador representa o receptor da zona, com a cor da comunicação. */
  receptor?: { nome: string; comunicacaoRecente: boolean } | null
  className?: string
}

const LARGURA = 1200
const ALTURA = 600
const ALTURA_TOTAL = 750
const COLUNAS = 14
const LINHAS = 8
const CORES = ["#3f5a2c", "#4d6b33", "#5d7a3a", "#6f8a45", "#2f4a26", "#7d8f52", "#8c7f55", "#a39566", "#52703a", "#38522b"]
// Contorno da zona e posição do marcador, em coordenadas do viewBox (aproximação do Figma).
const ZONA = "463,364 584,374 569,401 581,415 581,523 446,529 431,506"
const CENTRO = { x: 472, y: 449 }
const ZOOM = [1, 1.5, 2.25, 3.4] as const

/** Gerador determinístico, para o desenho não mudar entre renderizações. */
function aleatorio(semente: number) {
  let estado = semente
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296
    return estado / 4294967296
  }
}

function gerarTalhoes() {
  const sorteio = aleatorio(2026)
  const passoX = LARGURA / COLUNAS
  const passoY = ALTURA / LINHAS
  const vertices = Array.from({ length: LINHAS + 1 }, (_, l) =>
    Array.from({ length: COLUNAS + 1 }, (_, c) => {
      const borda = l === 0 || c === 0 || l === LINHAS || c === COLUNAS
      return {
        x: c * passoX + (borda ? 0 : (sorteio() - 0.5) * passoX * 0.7),
        y: l * passoY + (borda ? 0 : (sorteio() - 0.5) * passoY * 0.7),
      }
    }),
  )
  const talhoes: { pontos: string; cor: string; linhas: boolean }[] = []
  for (let l = 0; l < LINHAS; l++) {
    for (let c = 0; c < COLUNAS; c++) {
      const canto = [vertices[l][c], vertices[l][c + 1], vertices[l + 1][c + 1], vertices[l + 1][c]]
      talhoes.push({
        pontos: canto.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
        cor: CORES[Math.floor(sorteio() * CORES.length)],
        linhas: sorteio() > 0.62,
      })
    }
  }
  return talhoes
}

const talhoes = gerarTalhoes()

/**
 * Mapa ilustrativo da zona. Não há coordenadas nem geometria das zonas no banco: a localização
 * do Argos é por zona e RSSI. O desenho é fixo e o zoom apenas amplia a ilustração.
 */
export function MapaIlustrativoZona({ nomeZona, animaisNaZona, receptor, className }: MapaIlustrativoZonaProps) {
  const [nivel, setNivel] = useState(0)
  // O zoom reduz a área visível do desenho em torno da zona.
  const z = ZOOM[nivel]
  const larguraVisivel = LARGURA / z
  const alturaVisivel = ALTURA_TOTAL / z
  const caixa = nivel === 0
    ? `0 0 ${LARGURA} ${ALTURA_TOTAL}`
    : `${CENTRO.x - larguraVisivel / 2} ${CENTRO.y - alturaVisivel / 2} ${larguraVisivel} ${alturaVisivel}`
  const botao = "flex size-9 items-center justify-center rounded-md bg-white text-foreground shadow-md transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"

  return (
    <div className={cn("relative isolate aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#3f5a2c] ring-1 ring-foreground/30 sm:aspect-[2/1]", className)}>
      <svg
        role="img"
        aria-label={`Mapa ilustrativo de ${nomeZona}. Não representa a localização real dos animais.`}
        viewBox={caixa}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <defs>
          <pattern id="mapa-fileiras" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#000" strokeOpacity="0.16" strokeWidth="2" />
          </pattern>
        </defs>
        <g transform={`scale(1 ${ALTURA_TOTAL / ALTURA})`}>
          {talhoes.map((t, i) => (
            <g key={i}>
              <polygon points={t.pontos} fill={t.cor} stroke="#2a3a20" strokeOpacity="0.35" strokeWidth="1.5" />
              {t.linhas && <polygon points={t.pontos} fill="url(#mapa-fileiras)" />}
            </g>
          ))}
        </g>
        <path d="M0 520 C 220 470 380 640 610 600 S 960 520 1200 560" fill="none" stroke="#c9b48a" strokeOpacity="0.8" strokeWidth="5" />
        <path d="M760 0 C 720 180 820 330 700 460 S 640 700 690 750" fill="none" stroke="#c9b48a" strokeOpacity="0.7" strokeWidth="4" />
        <polygon points={ZONA} fill="#8fae5b" fillOpacity="0.55" stroke="#EE8A1B" strokeWidth="5" strokeLinejoin="round" />
        <foreignObject x={CENTRO.x - 20 / z} y={CENTRO.y - 26 / z} width={56 / z} height={46 / z}>
          {/* Marcador com tamanho constante na tela, independente do zoom. */}
          <div style={{ transform: `scale(${1 / z})`, transformOrigin: "0 0", width: 56, height: 46 }}>
          <div
            title={receptor
              ? `${receptor.nome}: ${receptor.comunicacaoRecente ? "comunicação recente" : "sem leitura recente"}`
              : `${nomeZona}: ${animaisNaZona ?? "—"} animais detectados nos últimos 5 minutos`}
            className="relative mt-[10px] ml-1 size-8"
          >
            <span className={cn("flex size-8 items-center justify-center rounded-full bg-white text-secondary shadow-md", receptor && "ring-3", receptor && (receptor.comunicacaoRecente ? "ring-[#0AA146]" : "ring-zinc-400"))}>
              {receptor
                ? <SatelliteDish aria-hidden="true" className="size-4.5" />
                : <Icon iconNode={cowHead} aria-hidden="true" className="size-5" />}
            </span>
            {animaisNaZona != null && (
              <span className="absolute -top-2.5 -right-4 min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] leading-5 font-semibold text-white">
                {animaisNaZona}
              </span>
            )}
          </div>
          </div>
        </foreignObject>
      </svg>

      <SeloSimulado
        className="absolute top-3 left-3 z-10 bg-card"
        descricao="Mapa ilustrativo: o Argos localiza os animais por zona de detecção (ESP32 e RSSI), sem coordenadas."
      />
      <div className="absolute right-4 bottom-4 z-10 flex flex-col gap-3 sm:right-[30px] sm:bottom-[45px]">
        <button type="button" className={botao} onClick={() => setNivel(0)} aria-label="Centralizar na zona"><LocateFixed className="size-5" /></button>
        <div className="flex flex-col gap-2">
          <button type="button" className={botao} disabled={nivel === ZOOM.length - 1} onClick={() => setNivel(n => Math.min(ZOOM.length - 1, n + 1))} aria-label="Aproximar"><Plus className="size-5" /></button>
          <button type="button" className={botao} disabled={nivel === 0} onClick={() => setNivel(n => Math.max(0, n - 1))} aria-label="Afastar"><Minus className="size-5" /></button>
        </div>
      </div>
    </div>
  )
}
