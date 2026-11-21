/**
 * TELEMETRIA DE QUALIDADE DA CAPTURA — manda ao servidor os números que `captureMetrics` mede.
 *
 * O ring buffer de `captureMetrics` morria na aba: `window.__capSummary()` só servia a quem abrisse
 * o DevTools, e "a legenda está lenta" não tinha como ser medido em produção. Este módulo drena o
 * acumulador de telemetria a cada 60 s enquanto a captura roda, e uma última vez ao parar.
 *
 * O QUE VAI, E SÓ ISSO: `{ v: 1, sttFinalMs, primeiroParcialMs, mtMs, rtf, descartesAlucinacao,
 * fallbacks, motorStt, motorMt }` — latências, RTF, contagens e o NOME do motor. Nenhum texto,
 * nenhum id de sessão ou de usuário (o servidor sabe quem é pelo Bearer, e não precisa guardar).
 *
 * QUANDO NÃO VAI NADA:
 *  - "Métricas de uso anônimas" desligada em Ajustes → Privacidade (`consentimentos.metricas`): é a
 *    mesma promessa — números de uso, sem conteúdo — e quem disse não, disse não para isto também.
 *    Não há preferência nova: uma segunda chave para a mesma promessa seria um interruptor que a
 *    pessoa não sabe que existe;
 *  - sem conta (modo anônimo): não há servidor para onde mandar — e o funil responderia 501 em
 *    silêncio de qualquer forma (a rota está em `SO_COM_CONTA` do teste de rotas espelhadas);
 *  - conta de menor RESTRITA (sem o responsável): os dados ficam no aparelho.
 *
 * TRANSPORTE. Periódico e no "parar": `apiFetch` com `keepalive` — leva o Bearer, trata 401 e passa
 * pelo funil (o `fetch` cru para `/api` é proibido fora dele). Na SAÍDA DA PÁGINA (`pagehide`):
 * `navigator.sendBeacon`, o único envio que o navegador garante com a aba morrendo — sem Bearer,
 * então só chega se o servidor aceitar a rota sem ele; se recusar, perde-se o último minuto, que é
 * o preço de não segurar a aba. No "parar" o beacon NÃO é usado justamente por isso: a página está
 * viva e o envio autenticado é possível. Toda falha é silenciosa: telemetria nunca vira erro na tela.
 */
import { FLAG_ROTEADOR_ADAPTATIVO_SOMBRA, FLAG_RUM_LATENCIA } from '../../core/planos';
import type { CampoDoRoteador } from '../../core/rota/sombraDoRoteador';
import { apiFetch } from '../../data/api';
import { perfilDoDispositivo } from '../../lib/dispositivo/perfil';
import { flagLigada } from '../../lib/flagsCache';
import { estadoDeIdentidade } from '../../lib/identidade';
import { fetchLangConfig } from '../../lib/langConfig';
import { lerPreferencias } from '../../lib/preferencias';
import { estadoDaProtecao, perfilProtegido } from '../../lib/protecaoDoMenor';
import { capMetrics, type LoteDaLegenda, type LoteDeTelemetria } from './captureMetrics';

export const ROTA_DA_TELEMETRIA = '/api/metricas/captura';
export const INTERVALO_DA_TELEMETRIA_MS = 60_000;

export type PayloadDeTelemetria = { v: 1 } & LoteDeTelemetria;

/**
 * O lote `v: 2` (telemetria de campo da latência da legenda, flag `rum_latencia`): só baldes fixos e contagens, por
 * classe de aparelho e idioma-base. Os limites são os de `LIMITES_DOS_BALDES_DE_CAMPO_MS` do servidor (a camada do
 * cliente não importa de `server/`; o teste de contrato barra a divergência). O último balde é o "acima de 10 s".
 */
export const LIMITES_DOS_BALDES_MS = [250, 500, 1000, 1500, 2000, 3000, 5000, 10000] as const;
const MAX_CONTAGEM = 200;
const MAX_CARGAS = 20;

export interface CampoDaLegenda {
  classe: string;
  fimDaFalaAteLegenda?: { idioma: string; baldes: number[]; n: number; falhas: number; semTraducao: number };
  carga?: { modelo: string; fase: string; baldes: number[] }[];
  /** O roteador adaptativo em sombra (flag `roteador_adaptativo_sombra`): só contagens de lista fechada, em baldes. */
  roteador?: CampoDoRoteador & { idioma: string };
}
export type PayloadDeTelemetriaV2 = Omit<PayloadDeTelemetria, 'v'> & { v: 2 } & CampoDaLegenda;

/** Quem drena a sombra do roteador (registrado por `lib/captura/sombraDaRota`, que só carrega com a flag ligada). */
let drenarRoteador: (() => CampoDoRoteador | null) | null = null;

/** A sombra do roteador adaptativo entrega aqui o que acumulou a cada envio. Substitui o registro anterior. */
export function registrarFonteDoRoteador(fonte: (() => CampoDoRoteador | null) | null): void {
  drenarRoteador = fonte;
}

let relogio: ReturnType<typeof setInterval> | null = null;
let aoSairDaPagina: (() => void) | null = null;
/** Idioma de origem da fala (o que a pessoa estuda); atualizado fora do `enviar`, que é síncrono (beacon). */
let idiomaDeOrigem = 'outro';

function atualizarIdioma(): void {
  if (!flagLigada(FLAG_RUM_LATENCIA)) return;
  void fetchLangConfig()
    .then((c) => {
      idiomaDeOrigem = c.studying;
    })
    .catch(() => {
      /* sem idioma, o servidor agrupa em `outro` */
    });
}

/** Campo só com a flag ligada E fora do perfil protegido (menor ou idade não declarada). */
function campoPermitido(): boolean {
  try {
    return flagLigada(FLAG_RUM_LATENCIA) && !perfilProtegido();
  } catch {
    return false;
  }
}

const baldeDe = (ms: number): number => {
  const i = LIMITES_DOS_BALDES_MS.findIndex((l) => ms <= l);
  return i === -1 ? LIMITES_DOS_BALDES_MS.length : i;
};
const novosBaldes = (): number[] => new Array<number>(LIMITES_DOS_BALDES_MS.length + 1).fill(0);
const teto = (n: number): number => Math.min(MAX_CONTAGEM, n);

/** Soma o que a medição drenou nos baldes fixos; `null` = nada a mandar. Sem texto, id, hora ou nome de sessão. */
function montarCampo(l: LoteDaLegenda, roteador: CampoDoRoteador | null): CampoDaLegenda | null {
  const campo: CampoDaLegenda = { classe: perfilDoDispositivo().tipo };
  if (l.fimDaFalaAteLegendaMs.length || l.falhas || l.semTraducao) {
    const baldes = novosBaldes();
    for (const ms of l.fimDaFalaAteLegendaMs) baldes[baldeDe(ms)] = teto((baldes[baldeDe(ms)] ?? 0) + 1);
    campo.fimDaFalaAteLegenda = {
      idioma: idiomaDeOrigem,
      baldes,
      n: teto(l.fimDaFalaAteLegendaMs.length),
      falhas: teto(l.falhas),
      semTraducao: teto(l.semTraducao),
    };
  }
  const cargas = new Map<string, { modelo: string; fase: string; baldes: number[] }>();
  for (const c of l.carga) {
    const chave = `${c.modelo}\u0000${c.fase}`;
    let item = cargas.get(chave);
    if (!item) {
      if (cargas.size >= MAX_CARGAS) continue;
      item = { modelo: c.modelo, fase: c.fase, baldes: novosBaldes() };
      cargas.set(chave, item);
    }
    item.baldes[baldeDe(c.ms)] = teto((item.baldes[baldeDe(c.ms)] ?? 0) + 1);
  }
  if (cargas.size) campo.carga = [...cargas.values()];
  if (roteador && flagLigada(FLAG_ROTEADOR_ADAPTATIVO_SOMBRA)) campo.roteador = { idioma: idiomaDeOrigem, ...roteador };
  return campo.fimDaFalaAteLegenda || campo.carga || campo.roteador ? campo : null;
}

function podeEnviar(): boolean {
  try {
    if (lerPreferencias().consentimentos.metricas === false) return false;
    const id = estadoDeIdentidade();
    if (id !== 'conta' && id !== 'selfhost') return false;
    return estadoDaProtecao()?.restrita !== true;
  } catch {
    return false;
  }
}

function vazio(l: LoteDeTelemetria): boolean {
  return (
    !l.sttFinalMs.length &&
    !l.primeiroParcialMs.length &&
    !l.mtMs.length &&
    !l.rtf.length &&
    !l.descartesAlucinacao &&
    !Object.keys(l.fallbacks).length
  );
}

/** Drena e envia. `saindo`: a página está indo embora — só o beacon chega. */
function enviar(saindo: boolean): void {
  // Drena SEMPRE: sem permissão, o lote é descartado em vez de acumular até alguém deixar mandar.
  const lote = capMetrics.drenarTelemetria();
  const legenda = capMetrics.drenarLegenda();
  // A sombra também drena SEMPRE: para o perfil protegido ou sem permissão, os números morrem aqui, em memória.
  const roteador = drenarRoteador?.() ?? null;
  if (!podeEnviar()) return;
  const campo = campoPermitido() ? montarCampo(legenda, roteador) : null;
  if (vazio(lote) && !campo) return;
  const payload: PayloadDeTelemetria | PayloadDeTelemetriaV2 = campo ? { v: 2, ...lote, ...campo } : { v: 1, ...lote };
  const corpo = JSON.stringify(payload);
  try {
    if (saindo && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ROTA_DA_TELEMETRIA, new Blob([corpo], { type: 'application/json' }));
      return;
    }
    void apiFetch(ROTA_DA_TELEMETRIA, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: corpo,
    }).catch(() => {
      /* telemetria que falha morre aqui, de propósito */
    });
  } catch {
    /* idem: nunca derruba a captura */
  }
}

/** Começa a janela de envio (START da captura). Idempotente. */
export function iniciarTelemetriaDeCaptura(): void {
  pararRelogio();
  atualizarIdioma();
  relogio = setInterval(() => enviar(false), INTERVALO_DA_TELEMETRIA_MS);
  if (typeof window !== 'undefined') {
    aoSairDaPagina = () => enviar(true);
    window.addEventListener('pagehide', aoSairDaPagina);
  }
}

function pararRelogio(): void {
  if (relogio) clearInterval(relogio);
  relogio = null;
  if (aoSairDaPagina && typeof window !== 'undefined') window.removeEventListener('pagehide', aoSairDaPagina);
  aoSairDaPagina = null;
}

/** Fecha a janela (STOP da captura): manda o que sobrou e para o relógio. Sem captura, não faz nada. */
export function pararTelemetriaDeCaptura(): void {
  if (!relogio && !aoSairDaPagina) return;
  pararRelogio();
  enviar(false);
}
