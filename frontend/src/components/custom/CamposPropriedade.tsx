import { CampoFormulario } from "@/components/custom/CampoFormulario"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SEM_UF, UFS, type FormularioPropriedade } from "@/lib/propriedade"

type CamposPropriedadeProps = {
  valor: FormularioPropriedade
  onChange: (valor: FormularioPropriedade) => void
  erros: Partial<Record<keyof FormularioPropriedade, string>>
}

const opcoesUf: Record<string, string> = { [SEM_UF]: "Não informada", ...Object.fromEntries(UFS.map(uf => [uf, uf])) }

/** Campos da propriedade, usados no primeiro acesso e na edição pelo Perfil. */
export function CamposPropriedade({ valor, onChange, erros }: CamposPropriedadeProps) {
  return (
    <>
      <CampoFormulario id="prop-nome" rotulo="Nome da propriedade" obrigatorio erro={erros.nome}>
        <Input id="prop-nome" value={valor.nome} maxLength={160} placeholder="Fazenda Boa Vista" aria-invalid={Boolean(erros.nome)} onChange={e => onChange({ ...valor, nome: e.target.value })} />
      </CampoFormulario>
      <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
        <CampoFormulario id="prop-municipio" rotulo="Município" erro={erros.municipio}>
          <Input id="prop-municipio" value={valor.municipio} maxLength={160} placeholder="Patos de Minas" onChange={e => onChange({ ...valor, municipio: e.target.value })} />
        </CampoFormulario>
        <CampoFormulario id="prop-uf" rotulo="UF">
          <Select items={opcoesUf} value={valor.uf} onValueChange={uf => onChange({ ...valor, uf: uf ?? SEM_UF })}>
            <SelectTrigger id="prop-uf" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(opcoesUf).map(([v, r]) => <SelectItem key={v} value={v}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </CampoFormulario>
      </div>
    </>
  )
}
