import { AlertTriangle, CheckCircle2, Download, HardDriveDownload, Loader2, RotateCw } from 'lucide-react';
import React from 'react';

import { estimarTempo, faixaEmTexto } from '../lib/dispositivo/vazao';
import { falhaDaCaptura } from '../lib/falhas/falhaNaTela';
import { numeroCom, t, tp } from '../lib/i18n';

/**
 * Painel de PREPARAÇÃO DO MODELO local — honesto e visível (antes: uma barrinha de 1.5px no
 * rodapé que sumia/reaparecia e parecia "re-download a cada captura").
 *
 * - `fromCache=true` → rótulo "Carregando (em cache)" em vez de "Baixando" (corrige a impressão
 *   de re-download quando os pesos JÁ estão no Cache Storage).
 * - Duas barras: Whisper (transcrição) e Tradutor (opus-mt) — o opus-mt antes baixava sem barra.
 * - Estado de erro com botão "Tentar de novo" (observabilidade de falha de download).
 * - Pacotes de idioma DO NAVEGADOR (Translator, reconhecimento no aparelho) como mais linhas do mesmo
 *   painel (`nativos`, estágio 4) — sem painel novo nem visual novo.
 */
export interface ModelPrepState {
  whisper: number | null; // 0..1 ou null (ocioso/pronto)
  mt: number | null;
  /** Bytes reais por modelo — a barra deixa de ser só um percentual sem escala. */
  whisperBytes?: { loaded: number; total: number } | null;
  mtBytes?: { loaded: number; total: number } | null;
  /** O modelo de TRANSCRIÇÃO já está no navegador (o título do painel segue ele). */
  fromCache: boolean;
  /** O tradutor local já está no navegador. Ausente = igual a `fromCache` (quem ainda não informa). */
  mtFromCache?: boolean;
  error: string | null;
  done: boolean;
  /**
   * Pacotes de idioma DO NAVEGADOR baixando (estágio 4): o do Translator (0..1) e o de voz do
   * reconhecimento no aparelho (`null` = sem porcentagem, `install()` não informa). Ausente = nenhum.
   * Quem mexe é `lib/captura/pacotesNativos.ts`.
   */
  nativos?: { tradutor?: number | null; voz?: number | null };
  /**
   * O tradutor ainda não começou, mas vai baixar depois da transcrição (carga-rapida-no-celular, 4.2): a barra dele
   * aparece desde o aceite, "na fila", em vez de surgir do nada quando a transcrição termina.
   */
  mtNaFila?: boolean;
  /** O tamanho do tradutor (MB), para a barra na fila e para a estimativa. */
  mbTradutor?: number;
  /** A vazão medida no download (Mbit/s, média de 10 s; `vazao.ts`). */
  vazaoMbps?: number | null;
  /** As falas guardadas enquanto o reconhecimento não está pronto (viram legenda quando ele chegar). */
  trechosGuardados?: number;
}

/** As saídas da rede lenta (estimativa acima de 2 min). Ausente = o painel não oferece nada. */
export interface SaidasDaRedeLenta {
  /** Trocar para o modelo menor (o whisper-tiny): chega antes, erra um pouco mais. */
  aoModeloMenor?: () => void;
  /** Adiar o tradutor que baixa JUNTO com a transcrição: a legenda começa antes, e as falas são traduzidas depois. */
  aoSoTranscricao?: () => void;
}

/** Acima disto (s) até a legenda, a tela oferece as saídas da rede lenta. */
export const LIMITE_DA_REDE_LENTA_S = 120;

/** Quanto falta da transcrição (bytes) e quando a legenda começa, pela vazão medida. Pura. */
export function estimativaDaLegenda(s: ModelPrepState): {
  faixa: ReturnType<typeof estimarTempo>;
  restanteBytes: number;
} {
  const b = s.whisperBytes;
  const restanteBytes = b && b.total > 0 && s.whisper !== null && s.whisper < 1 ? Math.max(0, b.total - b.loaded) : 0;
  return { faixa: estimarTempo(restanteBytes, s.vazaoMbps ?? null), restanteBytes };
}

function Bar({
  label,
  progress,
  bytes,
}: {
  label: string;
  progress: number | null;
  bytes?: { loaded: number; total: number } | null;
}) {
  const pct = progress == null ? 0 : Math.round(progress * 100);
  const complete = progress != null && progress >= 1;
  // Percentual sozinho não deixa o usuário julgar se vale esperar. Com bytes reais ele sabe.
  const emMb =
    bytes && bytes.total > 0 ? `${(bytes.loaded / 1048576).toFixed(0)}/${(bytes.total / 1048576).toFixed(0)} MB` : null;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
        <span className="text-ink-muted flex items-center gap-1.5">
          {complete ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-good" />
          ) : (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
          )}
          {label}
        </span>
        <span className="text-ink-muted tabular-nums">
          {emMb && !complete ? <span className="opacity-70 me-1.5">{emMb}</span> : null}
          {progress == null ? '-' : `${pct}%`}
        </span>
      </div>
      <div className="h-2 bg-canvas rounded-full overflow-hidden border border-border-subtle">
        <div className={`h-full transition-all ${complete ? 'bg-good' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** A barra de quem ainda não começou: o tamanho e "na fila", sem porcentagem inventada. */
function BarraNaFila({ label, mb }: { label: string; mb?: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
        <span className="text-ink-muted flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5 text-ink-muted" />
          {label}
        </span>
        <span className="text-ink-muted tabular-nums">
          {mb ? <span className="opacity-70 me-1.5">{`0/${Math.round(mb)} MB`}</span> : null}
          {t('na fila')}
        </span>
      </div>
      <div className="h-2 bg-canvas rounded-full overflow-hidden border border-border-subtle" />
    </div>
  );
}

/**
 * Oferta do modelo PRECISO (Parakeet): a captura roda no Whisper porque não há cópia dele no aparelho.
 * O download só começa no clique, em segundo plano, e vale para as PRÓXIMAS capturas.
 */
export interface OfertaDoPreciso {
  mb: number;
  aoBaixar: () => void;
  /** 0..1 enquanto baixa; null = ainda não pediu. */
  progresso: number | null;
  /** O último download falhou: a linha volta a oferecer, com o aviso. */
  falhou?: boolean;
}

export function LinhaDaOfertaDoPreciso({ oferta }: { oferta: OfertaDoPreciso }) {
  if (oferta.progresso !== null) {
    const pct = Math.round(Math.min(1, Math.max(0, oferta.progresso)) * 100);
    return (
      <div className="rounded-xl border border-border-subtle bg-surface p-3">
        <div className="flex items-center justify-between text-[11px] font-semibold mb-1 text-ink-muted">
          <span className="flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
            {t('Baixando o modelo preciso…')}
          </span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-label={t('Baixando o modelo preciso…')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-2 bg-canvas rounded-full overflow-hidden border border-border-subtle"
        >
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-3">
      {oferta.falhou && (
        <p className="text-[12px] text-error mb-2">{t('Não foi possível baixar o modelo preciso. Tente de novo.')}</p>
      )}
      <button
        type="button"
        onClick={oferta.aoBaixar}
        className="min-h-[44px] w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border-subtle text-[13px] font-semibold text-ink cursor-pointer hover:bg-canvas"
      >
        <Download className="w-4 h-4 text-accent" />
        {t('Baixar o modelo preciso ({mb} MB) para as próximas capturas', { mb: oferta.mb })}
      </button>
    </div>
  );
}

export default function ModelPrepPanel({
  state,
  onRetry,
  compact = false,
  ofertaDoPreciso,
  saidas,
}: {
  state: ModelPrepState;
  onRetry?: () => void;
  compact?: boolean;
  ofertaDoPreciso?: OfertaDoPreciso;
  /** As saídas da rede lenta (carga-rapida-no-celular, 4.3). */
  saidas?: SaidasDaRedeLenta;
}) {
  const painel = <PainelDoPreparo state={state} onRetry={onRetry} compact={compact} saidas={saidas} />;
  if (!ofertaDoPreciso) return painel;
  return (
    <div className={`space-y-2 ${compact ? 'max-w-sm mx-auto' : ''}`}>
      {painel}
      <LinhaDaOfertaDoPreciso oferta={ofertaDoPreciso} />
    </div>
  );
}

function PainelDoPreparo({
  state,
  onRetry,
  compact,
  saidas,
}: {
  state: ModelPrepState;
  onRetry?: () => void;
  compact: boolean;
  saidas?: SaidasDaRedeLenta;
}) {
  const { whisper, mt, fromCache, error, done, whisperBytes, mtBytes } = state;
  const naFila = mt === null && !!state.mtNaFila;
  const { faixa } = estimativaDaLegenda(state);
  const lenta = !!faixa && faixa.minS > LIMITE_DA_REDE_LENTA_S;
  /* O tradutor baixa JUNTO com a transcrição (rede ou memória sobrando): adiar dá a banda toda à transcrição. */
  const tradutorJunto = mt !== null && mt < 1 && whisper !== null && whisper < 1;
  const trechos = state.trechosGuardados ?? 0;
  const mtFromCache = state.mtFromCache ?? fromCache;
  /* Só o tradutor baixa de verdade (a transcrição veio do cache): o título diz isso, e não "Baixando
     modelo" — o que dava a impressão de baixar tudo de novo a cada abertura. */
  const soOTradutorBaixa = fromCache && mt !== null && !mtFromCache;
  const tudoEmCache = fromCache && !soOTradutorBaixa;
  const nativos = state.nativos ?? {};
  const temNativos = Object.keys(nativos).length > 0;
  /* Só os pacotes do navegador (nenhum modelo nosso em preparo): o painel fala deles, sem a linha
     do Whisper e sem prometer "uma vez só" de um download que não é nosso. */
  const soNativos = temNativos && whisper === null && mt === null;
  const nativosProntos = Object.values(nativos).every((p) => p != null && p >= 1);

  if (error) {
    /* O erro cru do runtime ("Failed to fetch", "Can't create a session") nunca vai à tela: o mapa de falhas
       dá o texto em pt-BR e a ação (DISP-03). O original só aparece em dev e no self-host. */
    const falha = falhaDaCaptura(error);
    const recarregar = falha.acao.tipo === 'recarregar';
    return (
      <div
        className={`rounded-xl border border-error/30 bg-error-soft/10 p-4 ${compact ? 'max-w-sm mx-auto' : ''}`}
        data-testid="erro-do-preparo"
        data-falha={falha.tipo}
      >
        <div className="flex items-start gap-2 text-error text-[13px] font-semibold">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p>{t('Não foi possível preparar o modelo.')}</p>
            <p className="font-normal text-ink-muted mt-0.5 text-[12px]">{t(falha.texto)}</p>
            {falha.detalhe && <p className="font-normal text-ink-muted mt-0.5 text-[11px]">{falha.detalhe}</p>}
          </div>
        </div>
        {(onRetry || recarregar) && (
          <button
            onClick={recarregar ? () => window.location.reload() : onRetry}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-ink text-white text-[12px] font-bold cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" /> {t(falha.acao.rotulo)}
          </button>
        )}
      </div>
    );
  }

  // "Pronto" é TUDO pronto: o tradutor pode seguir baixando depois do Whisper (pouca memória).
  if (done && nativosProntos && (mt === null || mt >= 1)) {
    return (
      <div
        className={`flex items-center justify-center gap-2 text-[13px] font-semibold text-good ${compact ? '' : 'py-2'}`}
      >
        <CheckCircle2 className="w-4 h-4" /> Modelo pronto, no dispositivo, offline.
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-border-subtle bg-surface p-4 space-y-3 ${compact ? 'max-w-sm mx-auto' : ''}`}
    >
      <div className="flex items-center gap-2 text-[13px] font-bold text-ink">
        {tudoEmCache && !soNativos ? (
          <HardDriveDownload className="w-4 h-4 text-accent" />
        ) : (
          <Download className="w-4 h-4 text-accent" />
        )}
        {soNativos
          ? t('Baixando o pacote de idioma do navegador…')
          : tudoEmCache
            ? 'Carregando modelo (já em cache)…'
            : soOTradutorBaixa
              ? 'Baixando o tradutor (uma vez só)…'
              : 'Baixando modelo (uma vez só)…'}
      </div>
      {/* Sem modelo de transcrição (o "Rápido": só o tradutor baixa), sem a linha dele parada em "-". */}
      {!soNativos && !(whisper === null && mt !== null) && (
        <Bar label="Transcrição (Whisper)" progress={whisper} bytes={whisperBytes} />
      )}
      {mt !== null && <Bar label="Tradutor (opus-mt)" progress={mt} bytes={mtBytes} />}
      {naFila && <BarraNaFila label="Tradutor (opus-mt)" mb={state.mbTradutor} />}
      {naFila && (
        <p className="text-[11px] text-ink-muted leading-relaxed">
          {t('O tradutor começa a baixar quando a transcrição terminar. As falas são traduzidas quando ele chegar.')}
        </p>
      )}
      {faixa && (
        <p className="text-[12px] font-semibold text-ink" data-testid="estimativa-do-preparo" aria-live="polite">
          {t('A legenda começa em {faixa}.', { faixa: faixaEmTexto(faixa, t) })}{' '}
          <span className="font-normal text-ink-muted">
            {t('Velocidade medida: {v} Mbit/s.', {
              v: numeroCom(state.vazaoMbps ?? 0, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
            })}
          </span>
        </p>
      )}
      {trechos > 0 && (
        <p className="text-[12px] text-ink-muted" data-testid="falas-guardadas">
          {tp(
            trechos,
            '{n} fala guardada: ela vira legenda quando o download terminar.',
            '{n} falas guardadas: elas viram legenda quando o download terminar.',
          )}
        </p>
      )}
      {lenta && saidas && (saidas.aoModeloMenor || (tradutorJunto && saidas.aoSoTranscricao)) && (
        <div
          className="rounded-lg border border-border-subtle bg-canvas p-3 space-y-2"
          data-testid="saidas-da-rede-lenta"
        >
          <p className="text-[12px] font-semibold text-ink">{t('A conexão está lenta. Quer começar antes?')}</p>
          {saidas.aoModeloMenor && (
            <button
              type="button"
              onClick={saidas.aoModeloMenor}
              className="min-h-[44px] w-full text-left px-3 py-2 rounded-lg border border-border-subtle bg-surface text-[13px] font-semibold text-ink cursor-pointer hover:bg-canvas"
            >
              {t('Usar um modelo menor')}
              <span className="block font-normal text-[12px] text-ink-muted">
                {t(
                  'Baixa menos da metade e a legenda começa antes; ela erra um pouco mais. Dá para voltar em Ajustes.',
                )}
              </span>
            </button>
          )}
          {tradutorJunto && saidas.aoSoTranscricao && (
            <button
              type="button"
              onClick={saidas.aoSoTranscricao}
              className="min-h-[44px] w-full text-left px-3 py-2 rounded-lg border border-border-subtle bg-surface text-[13px] font-semibold text-ink cursor-pointer hover:bg-canvas"
            >
              {t('Começar só com a transcrição')}
              <span className="block font-normal text-[12px] text-ink-muted">
                {t('O tradutor baixa depois. As falas são traduzidas quando ele chegar.')}
              </span>
            </button>
          )}
        </div>
      )}
      {nativos.voz !== undefined && <Bar label={t('Reconhecimento de voz do navegador')} progress={nativos.voz} />}
      {nativos.tradutor !== undefined && <Bar label={t('Tradutor do navegador')} progress={nativos.tradutor} />}
      <p className="text-[11px] text-ink-muted leading-relaxed">
        {soNativos
          ? t('O pacote é do próprio navegador: grátis, baixa uma vez só e nada sai do aparelho.')
          : tudoEmCache
            ? 'Os pesos já estão no seu navegador, nada é baixado de novo.'
            : 'Roda 100% no seu dispositivo depois de baixar. Recarregar a página não baixa de novo.'}
      </p>
    </div>
  );
}
