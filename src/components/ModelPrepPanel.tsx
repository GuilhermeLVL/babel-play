import { AlertTriangle, CheckCircle2, Download, HardDriveDownload,Loader2, RotateCw } from 'lucide-react';
import React from 'react';

import { t } from '../lib/i18n';

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
  fromCache: boolean;
  error: string | null;
  done: boolean;
  /**
   * Pacotes de idioma DO NAVEGADOR baixando (estágio 4): o do Translator (0..1) e o de voz do
   * reconhecimento no aparelho (`null` = sem porcentagem, `install()` não informa). Ausente = nenhum.
   * Quem mexe é `lib/captura/pacotesNativos.ts`.
   */
  nativos?: { tradutor?: number | null; voz?: number | null };
}

function Bar({ label, progress, bytes }: { label: string; progress: number | null; bytes?: { loaded: number; total: number } | null }) {
  const pct = progress == null ? 0 : Math.round(progress * 100);
  const complete = progress != null && progress >= 1;
  // Percentual sozinho não deixa o usuário julgar se vale esperar. Com bytes reais ele sabe.
  const emMb = bytes && bytes.total > 0
    ? `${(bytes.loaded / 1048576).toFixed(0)}/${(bytes.total / 1048576).toFixed(0)} MB`
    : null;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
        <span className="text-ink-muted flex items-center gap-1.5">
          {complete ? <CheckCircle2 className="w-3.5 h-3.5 text-good" /> : <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />}
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

export default function ModelPrepPanel({
  state,
  onRetry,
  compact = false,
}: {
  state: ModelPrepState;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const { whisper, mt, fromCache, error, done, whisperBytes, mtBytes } = state;
  const nativos = state.nativos ?? {};
  const temNativos = Object.keys(nativos).length > 0;
  /* Só os pacotes do navegador (nenhum modelo nosso em preparo): o painel fala deles, sem a linha
     do Whisper e sem prometer "uma vez só" de um download que não é nosso. */
  const soNativos = temNativos && whisper === null && mt === null;
  const nativosProntos = Object.values(nativos).every((p) => p != null && p >= 1);

  if (error) {
    return (
      <div className={`rounded-xl border border-error/30 bg-error-soft/10 p-4 ${compact ? 'max-w-sm mx-auto' : ''}`}>
        <div className="flex items-start gap-2 text-error text-[13px] font-semibold">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p>Não foi possível preparar o modelo.</p>
            <p className="font-normal text-ink-muted mt-0.5 text-[12px]">{error}</p>
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-ink text-white text-[12px] font-bold cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" /> Tentar de novo
          </button>
        )}
      </div>
    );
  }

  // "Pronto" é TUDO pronto: o tradutor pode seguir baixando depois do Whisper (pouca memória).
  if (done && nativosProntos && (mt === null || mt >= 1)) {
    return (
      <div className={`flex items-center justify-center gap-2 text-[13px] font-semibold text-good ${compact ? '' : 'py-2'}`}>
        <CheckCircle2 className="w-4 h-4" /> Modelo pronto, no dispositivo, offline.
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-border-subtle bg-surface p-4 space-y-3 ${compact ? 'max-w-sm mx-auto' : ''}`}>
      <div className="flex items-center gap-2 text-[13px] font-bold text-ink">
        {fromCache && !soNativos ? (
          <HardDriveDownload className="w-4 h-4 text-accent" />
        ) : (
          <Download className="w-4 h-4 text-accent" />
        )}
        {soNativos
          ? t('Baixando o pacote de idioma do navegador…')
          : fromCache
            ? 'Carregando modelo (já em cache)…'
            : 'Baixando modelo (uma vez só)…'}
      </div>
      {/* Sem modelo de transcrição (o "Rápido": só o tradutor baixa), sem a linha dele parada em "-". */}
      {!soNativos && !(whisper === null && mt !== null) && (
        <Bar label="Transcrição (Whisper)" progress={whisper} bytes={whisperBytes} />
      )}
      {mt !== null && <Bar label="Tradutor (opus-mt)" progress={mt} bytes={mtBytes} />}
      {nativos.voz !== undefined && <Bar label={t('Reconhecimento de voz do navegador')} progress={nativos.voz} />}
      {nativos.tradutor !== undefined && <Bar label={t('Tradutor do navegador')} progress={nativos.tradutor} />}
      <p className="text-[11px] text-ink-muted leading-relaxed">
        {soNativos
          ? t('O pacote é do próprio navegador: grátis, baixa uma vez só e nada sai do aparelho.')
          : fromCache
            ? 'Os pesos já estão no seu navegador, nada é baixado de novo.'
            : 'Roda 100% no seu dispositivo depois de baixar. Recarregar a página não baixa de novo.'}
      </p>
    </div>
  );
}
