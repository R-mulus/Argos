import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AnimalMapa, ReceptorMapa, TrilhaMapa } from "@/lib/mapa";

const metros = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m`;

function Instante({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  const data = valor ? new Date(valor) : null;
  return (
    <>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="tabular-nums">
        {data && Number.isFinite(data.getTime())
          ? <time dateTime={valor!} title={format(data, "dd/MM/yyyy HH:mm:ss")}>{format(data, "dd/MM HH:mm:ss")} <span className="text-muted-foreground">({formatDistanceToNowStrict(data, { locale: ptBR, addSuffix: true })})</span></time>
          : "—"}
      </dd>
    </>
  );
}

/** Conteúdo do popup do animal. Coordenadas sempre em metros locais, nunca latitude/longitude. */
export function DetalheAnimalMapa({ animal, trilha }: { animal: AnimalMapa; trilha: TrilhaMapa | null }) {
  return (
    <div className="grid gap-2 font-sans text-xs text-foreground">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 pr-4">
        <strong className="text-sm">{animal.identificacao}</strong>
        <span className={animal.atualidade === "recente" ? "text-[#0A7A37]" : "font-medium text-muted-foreground"}>
          {animal.atualidade === "recente" ? "Posição recente" : "Última posição conhecida (desatualizada)"}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Zona (detecção)</dt>
        <dd>{animal.zonaNome ?? "Sem zona"}</dd>
        <dt className="text-muted-foreground">Estimativa RSSI</dt>
        <dd className="tabular-nums">x {metros(animal.x)} · y {metros(animal.y)}</dd>
        <Instante rotulo="Detectado" valor={animal.observadoEm} />
        <Instante rotulo="Recebido" valor={animal.recebidoEm} />
        <Instante rotulo="Processado" valor={animal.calculadoEm} />
        <dt className="text-muted-foreground">Receptores</dt>
        <dd>{animal.receptoresUtilizados}</dd>
        <dt className="text-muted-foreground">Resíduo do ajuste</dt>
        <dd>{metros(animal.erroResidualM)} <span className="text-muted-foreground">(não é margem de erro)</span></dd>
      </dl>
      {(animal.atrasada || animal.aguardandoConfirmacao || animal.naoUsadas > 0) && (
        <ul className="grid gap-1 rounded-md bg-muted px-2 py-1.5 text-[11px] leading-snug">
          {animal.atrasada && <li>Estimativa processada com atraso em relação à detecção.</li>}
          {animal.aguardandoConfirmacao && <li>Há uma estimativa mais nova muito distante; o marcador só se move se a próxima confirmar.</li>}
          {animal.naoUsadas > 0 && <li>{animal.naoUsadas} {animal.naoUsadas === 1 ? "estimativa recente não usada" : "estimativas recentes não usadas"} (salto isolado, sem horário ou inválida).</li>}
        </ul>
      )}
      {trilha && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Trilha: {trilha.aceitas.length} {trilha.aceitas.length === 1 ? "estimativa" : "estimativas"} em ordem de detecção. Tracejado: intervalo sem cobertura. Pontos vazados: estimativas não usadas.
        </p>
      )}
    </div>
  );
}

const ESTADO_RECEPTOR: Record<NonNullable<ReceptorMapa["estado"]>, string> = {
  recente: "Comunicação recente",
  sem_leitura_recente: "Sem leitura recente",
  aguardando_primeira_leitura: "Aguardando primeira leitura",
};

export function DetalheReceptorMapa({ receptor }: { receptor: ReceptorMapa }) {
  return (
    <div className="grid gap-2 font-sans text-xs text-foreground">
      <div className="pr-4">
        <strong className="text-sm">{receptor.nome ?? receptor.codigo}</strong>
        {receptor.nome && <span className="ml-2 text-muted-foreground">{receptor.codigo}</span>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Situação</dt>
        <dd>{receptor.inativo ? "Inativo no cadastro" : receptor.estado ? ESTADO_RECEPTOR[receptor.estado] : "Desconhecida"}</dd>
        <Instante rotulo="Última leitura" valor={receptor.ultimaComunicacaoEm} />
        <dt className="text-muted-foreground">Zona</dt>
        <dd>{receptor.zonaNome ?? "Sem zona"}</dd>
        <dt className="text-muted-foreground">Coordenadas</dt>
        <dd className="tabular-nums">x {metros(receptor.x)} · y {metros(receptor.y)}</dd>
        <dt className="text-muted-foreground">Calibração</dt>
        <dd className="tabular-nums">{receptor.rssi1mDbm} dBm a 1 m · n {receptor.expoentePerda.toLocaleString("pt-BR")}</dd>
      </dl>
      <p className="text-[11px] leading-snug text-muted-foreground">A comunicação é inferida das leituras: sem coleiras por perto, não há como distinguir rádio parado de receptor desligado.</p>
    </div>
  );
}
