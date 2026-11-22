import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"

type CampoFormularioProps = {
  id: string
  rotulo: string
  obrigatorio?: boolean
  ajuda?: string
  erro?: string
  children: ReactNode
}

/** Rótulo, controle, texto de ajuda e erro de validação com os vínculos de acessibilidade. */
export function CampoFormulario({ id, rotulo, obrigatorio, ajuda, erro, children }: CampoFormularioProps) {
  return (
    // O token --input é branco: os campos recebem contorno visível e altura confortável.
    <div className="grid content-start gap-1.5 [&_[data-slot=input]]:h-10 [&_[data-slot=input]:not([aria-invalid=true])]:border-foreground/25 [&_[data-slot=select-trigger]]:h-10! [&_[data-slot=select-trigger]:not([aria-invalid=true])]:border-foreground/25">
      <Label htmlFor={id} className="text-sm font-medium">
        {rotulo}{obrigatorio && <span aria-hidden="true" className="text-primary"> *</span>}
      </Label>
      {children}
      {erro ? <p id={`${id}-erro`} role="alert" className="text-xs text-destructive">{erro}</p>
        : ajuda && <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  )
}
