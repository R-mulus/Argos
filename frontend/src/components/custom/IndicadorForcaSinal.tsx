import { cn } from "cn"

export type SignalStrengthIndicatorProps = {
  /** RSSI medido pelo dispositivo receptor, em dBm. `null` indica ausência de leitura. */
  rssiDbm: number | null
  /** Quando false, a medição não é apresentada como sinal atual. */
  isOnline?: boolean
  className?: string
}

// Limiares provisórios de interface: calibrar com leituras reais na fazenda.
// Nível 0: <= -90; 1: (-90,-80]; 2: (-80,-70];
// 3: (-70,-60]; 4: (-60,-50]; 5: > -50 dBm.
export function getSignalLevel(rssiDbm: number | null): number {
  if (rssiDbm === null || !Number.isFinite(rssiDbm)) return 0
  if (rssiDbm <= -90) return 0
  if (rssiDbm <= -80) return 1
  if (rssiDbm <= -70) return 2
  if (rssiDbm <= -60) return 3
  if (rssiDbm <= -50) return 4
  return 5
}

const bars = [
  { height: "h-[31%]", label: 1 },
  { height: "h-[54%]", label: 2 },
  { height: "h-[69%]", label: 3 },
  { height: "h-[85%]", label: 4 },
  { height: "h-full", label: 5 },
] as const

export function SignalStrengthIndicator({
  rssiDbm,
  isOnline = true,
  className,
}: SignalStrengthIndicatorProps) {
  const hasReading = isOnline && rssiDbm !== null && Number.isFinite(rssiDbm)
  const level = hasReading ? getSignalLevel(rssiDbm) : 0
  const description = hasReading
    ? `Intensidade do sinal: ${level} de 5 barras (${rssiDbm} dBm)`
    : "Intensidade do sinal indisponível"

  return (
    <div
      role="img"
      aria-label={description}
      className={cn("flex h-[clamp(42px,16cqw,65px)] w-[clamp(55px,18cqw,80px)] shrink-0 items-end justify-between gap-[clamp(2px,1cqw,5px)]", className)}
    >
      {bars.map((bar) => (
        <span
          key={bar.label}
          aria-hidden="true"
          className={cn(
            "block min-w-0 flex-1 rounded-t-[3px] @min-[400px]:rounded-t-[5px]",
            bar.height,
            bar.label <= level ? "bg-primary" : "bg-[#D9D9D9]",
          )}
        />
      ))}
    </div>
  )
}
