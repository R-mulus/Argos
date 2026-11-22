export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

export type FormularioPropriedade = { nome: string; municipio: string; uf: string };
export const SEM_UF = "sem-uf";

/** Regras de `POST/PATCH /propriedades`: nome obrigatório até 160 caracteres, município até 160, UF com duas letras. */
export function validarPropriedade(f: FormularioPropriedade) {
  const erros: Partial<Record<keyof FormularioPropriedade, string>> = {};
  if (!f.nome.trim()) erros.nome = "Informe o nome da propriedade.";
  else if (f.nome.trim().length > 160) erros.nome = "Use até 160 caracteres.";
  if (f.municipio.trim().length > 160) erros.municipio = "Use até 160 caracteres.";
  return erros;
}

export const dadosPropriedade = (f: FormularioPropriedade) => ({
  nome: f.nome.trim(),
  municipio: f.municipio.trim() || null,
  uf: f.uf === SEM_UF ? null : f.uf,
});
