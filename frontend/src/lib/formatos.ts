import { differenceInDays, differenceInMonths, differenceInYears } from "date-fns";

/** Idade legível a partir da data de nascimento (AAAA-MM-DD): "12 dias", "3 meses", "4 anos". */
export function formatarIdade(dataNascimento: string | null, agora = new Date()) {
  if (!dataNascimento) return "—";
  const nascimento = new Date(`${dataNascimento.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(nascimento.getTime()) || nascimento > agora) return "—";
  const meses = differenceInMonths(agora, nascimento);
  if (meses < 1) {
    const dias = differenceInDays(agora, nascimento);
    return `${dias} ${dias === 1 ? "dia" : "dias"}`;
  }
  if (meses < 24) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  return `${differenceInYears(agora, nascimento)} anos`;
}

/** Data local de hoje no formato AAAA-MM-DD (para campos de data e pesagens). */
export function hojeIso() {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** "2026-11-16" → "16/11/2026". */
export const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export const formatarKg = (kg: number) => `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
