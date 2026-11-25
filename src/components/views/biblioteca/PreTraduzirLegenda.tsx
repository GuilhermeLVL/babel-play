import { Languages, Loader2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { FLAG_PRE_TRADUCAO_DE_LEGENDAS } from '../../../core/planos';
import {
  type EstadoDaPreTraducao,
  type FalaPreTraduzida,
  preTraduzirLegenda,
  type ProgressoDaPreTraducao,
} from '../../../core/traducao/preTraducaoDeLegendas';
import { tradutorLocalDaPreTraducaoDeLegendas } from '../../../gateway';
import type { TradutorDaPreTraducao } from '../../../gateway/preTraducaoLocal';
import { tamanhoDoDownloadMb } from '../../../gateway/sttRouter';
import { useFlag } from '../../../lib/flags';
import { t, tp } from '../../../lib/i18n';
import { formatoDaLegenda, textoDaLegenda } from '../../../lib/import/legendas';
import { fetchLangConfig } from '../../../lib/langConfig';
import { politicaDaLegendaAtual } from '../../../lib/politicaDaLegenda';

/**
 * PRÉ-TRADUÇÃO DA LEGENDA IMPORTADA, NO APARELHO (openspec `pre-traducao-de-legendas`, tarefa 5.1). Mora dentro do painel de
 * importar (sem menu novo) e só existe com a flag `pre_traducao_de_legendas` ligada; desligada, não renderiza nada.
 *
 *  1. "Traduzir tudo no aparelho": se o tradutor ainda não está no navegador, AVISA o tamanho do download e espera o "sim".
 *  2. Progresso honesto (traduzidas de total; estimativa só depois de 5 traduções), cancelável por teclado, sem travar a tela
 *     (o núcleo devolve a vez ao navegador entre lotes).
 *  3. Resultado em coluna bilíngue (original + tradução); a fala que falhou aparece como "não traduzida".
 */

export interface Idiomas {
  de: string;
  para: string;
}

interface Props {
  arquivo: File;
  /** Injetáveis para teste; em produção vêm do gateway e da configuração de idioma. */
  criarTradutor?: (de: string, para: string) => TradutorDaPreTraducao;
  idiomas?: Idiomas;
  mbDoDownload?: number;
  /** Quanto espera entre conferências de "o modelo já chegou?" (ms). */
  esperaDoModeloMs?: number;
}

type Fase =
  | { tipo: 'parado' }
  | { tipo: 'avisando'; falas: string[]; idiomas: Idiomas; tradutor: TradutorDaPreTraducao; mb: number }
  | { tipo: 'baixando'; pct: number | null }
  | { tipo: 'traduzindo'; progresso: ProgressoDaPreTraducao }
  | { tipo: 'pronto'; estado: EstadoDaPreTraducao; falas: FalaPreTraduzida[]; progresso: ProgressoDaPreTraducao }
  | { tipo: 'erro'; mensagem: string };

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function PreTraduzirLegenda({
  arquivo,
  criarTradutor = tradutorLocalDaPreTraducaoDeLegendas,
  idiomas,
  mbDoDownload,
  esperaDoModeloMs = 400,
}: Props) {
  const ligada = useFlag(FLAG_PRE_TRADUCAO_DE_LEGENDAS);
  const [fase, setFase] = useState<Fase>({ tipo: 'parado' });
  const [anuncio, setAnuncio] = useState('');
  const aborto = useRef<AbortController | null>(null);

  // Trocar de arquivo ou sair da tela cancela o que estiver rodando e limpa o resultado.
  useEffect(() => {
    setFase({ tipo: 'parado' });
    setAnuncio('');
    return () => aborto.current?.abort();
  }, [arquivo]);

  if (!ligada) return null;
  const formato = formatoDaLegenda(arquivo.name);
  if (!formato) return null;

  const preparar = async () => {
    try {
      if (arquivo.size > 5 * 1024 * 1024) throw new Error(t('Esta legenda é grande demais (limite de 5 MB).'));
      const falas = textoDaLegenda(await arquivo.text(), formato).split('\n');
      let ids: Idiomas;
      if (idiomas) ids = idiomas;
      else {
        const cfg = await fetchLangConfig();
        ids = { de: cfg.studying, para: cfg.mine };
      }
      const tradutor = criarTradutor(ids.de, ids.para);
      if (tradutor.pronto()) return void (await traduzir(falas, tradutor));
      const mb = mbDoDownload ?? tamanhoDoDownloadMb(`Xenova/opus-mt-${ids.de}-${ids.para}`) ?? 0;
      setFase({ tipo: 'avisando', falas, idiomas: ids, tradutor, mb });
    } catch (e) {
      setFase({ tipo: 'erro', mensagem: e instanceof Error ? e.message : t('Não consegui ler esta legenda.') });
    }
  };

  const traduzir = async (falas: string[], tradutor: TradutorDaPreTraducao) => {
    const ac = new AbortController();
    aborto.current = ac;
    try {
      if (!tradutor.pronto()) {
        setFase({ tipo: 'baixando', pct: null });
        setAnuncio(t('Baixando o tradutor…'));
        tradutor.aquecer((p) => setFase({ tipo: 'baixando', pct: Math.round(p * 100) }));
        while (!tradutor.pronto()) {
          if (ac.signal.aborted) return void setFase({ tipo: 'parado' });
          await dormir(esperaDoModeloMs);
        }
      }
      const r = await preTraduzirLegenda({
        falas,
        traduzir: tradutor.traduzir,
        politica: politicaDaLegendaAtual(),
        signal: ac.signal,
        aoProgredir: (p) => {
          setFase({ tipo: 'traduzindo', progresso: p });
          // A leitura de tela ouve de 10 em 10 falas, não a cada uma.
          if (p.feitas === 1 || p.feitas % 10 === 0)
            setAnuncio(t('{feitas} de {total} falas traduzidas', { feitas: p.feitas, total: p.total }));
        },
      });
      setAnuncio(
        r.estado === 'concluida'
          ? t('Tradução concluída.')
          : r.estado === 'cancelada'
            ? t('Tradução cancelada.')
            : t('A tradução parou.'),
      );
      setFase({ tipo: 'pronto', estado: r.estado, falas: r.falas, progresso: r.progresso });
    } catch (e) {
      setFase({ tipo: 'erro', mensagem: e instanceof Error ? e.message : t('A tradução parou.') });
    }
  };

  const cancelar = () => aborto.current?.abort();
  const ocupado = fase.tipo === 'baixando' || fase.tipo === 'traduzindo';

  return (
    <div className="pre-traducao" style={{ flexBasis: '100%' }}>
      {!ocupado && fase.tipo !== 'avisando' && (
        <button type="button" className="btn btn-outline" onClick={() => void preparar()}>
          <Languages aria-hidden /> {t('Traduzir tudo no aparelho')}
        </button>
      )}

      {fase.tipo === 'avisando' && (
        <div role="group" aria-label={t('Aviso de download')} className="cartao p5">
          <p>
            {fase.mb > 0
              ? t('Para traduzir no aparelho, o tradutor precisa ser baixado uma vez (cerca de {mb} MB).', {
                  mb: Math.round(fase.mb),
                })
              : t('Para traduzir no aparelho, o tradutor precisa ser baixado uma vez.')}{' '}
            {t('Depois disso a tradução funciona sem internet e a legenda não sai do aparelho.')}
          </p>
          <div className="entre" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-solid" onClick={() => void traduzir(fase.falas, fase.tradutor)}>
              {t('Baixar e traduzir')}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setFase({ tipo: 'parado' })}>
              {t('Agora não')}
            </button>
          </div>
        </div>
      )}

      {ocupado && (
        <div className="cartao p5">
          {fase.tipo === 'baixando' ? (
            <p>
              <Loader2 aria-hidden className="girar" />{' '}
              {fase.pct === null ? t('Baixando o tradutor…') : t('Baixando o tradutor… {pct}%', { pct: fase.pct })}
            </p>
          ) : (
            <>
              <progress
                value={fase.progresso.feitas}
                max={Math.max(1, fase.progresso.total)}
                aria-label={t('Progresso da tradução')}
                style={{ width: '100%' }}
              />
              <p className="mut" style={{ fontSize: 12.5 }}>
                {t('{feitas} de {total} falas', { feitas: fase.progresso.feitas, total: fase.progresso.total })}
                {fase.progresso.restanteEstimadoMs !== null &&
                  ` · ${t('estimativa: cerca de {s} s', { s: Math.max(1, Math.round(fase.progresso.restanteEstimadoMs / 1000)) })}`}
              </p>
            </>
          )}
          <button type="button" className="btn btn-outline peq" onClick={cancelar}>
            <X aria-hidden /> {t('Cancelar')}
          </button>
        </div>
      )}

      {/* Anúncio educado para leitor de tela; fica no DOM o tempo todo para o aviso ser lido. */}
      <div className="sr" role="status" aria-live="polite">
        {anuncio}
      </div>

      {fase.tipo === 'erro' && (
        <p role="alert" className="mut">
          {fase.mensagem}
        </p>
      )}

      {fase.tipo === 'pronto' && <Resultado {...fase} />}
    </div>
  );
}

function Resultado({
  estado,
  falas,
  progresso,
}: {
  estado: EstadoDaPreTraducao;
  falas: FalaPreTraduzida[];
  progresso: ProgressoDaPreTraducao;
}) {
  const aviso =
    estado === 'cancelada'
      ? t('Você cancelou: mostrando as {n} falas já traduzidas.', { n: falas.length })
      : estado === 'aguardando-motor'
        ? t('O tradutor ainda não ficou pronto neste aparelho. Tente de novo em instantes.')
        : estado === 'falhou'
          ? t('O tradutor falhou várias vezes seguidas e a tradução parou.')
          : null;
  return (
    <div style={{ marginTop: 12 }}>
      {aviso && <p className="mut">{aviso}</p>}
      {progresso.falhas > 0 && (
        <p className="mut">{tp(progresso.falhas, '{n} fala não foi traduzida.', '{n} falas não foram traduzidas.')}</p>
      )}
      <div style={{ maxHeight: 360, overflow: 'auto' }}>
        <table style={{ width: '100%' }}>
          <caption className="sr">{t('Legenda original e tradução, lado a lado')}</caption>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'start' }}>
                {t('Original')}
              </th>
              <th scope="col" style={{ textAlign: 'start' }}>
                {t('Tradução')}
              </th>
            </tr>
          </thead>
          <tbody>
            {falas.map((f) => (
              <tr key={f.indice}>
                <td>{f.original}</td>
                <td>{f.traducao ?? (f.original.trim() ? <em className="mut">{t('não traduzida')}</em> : '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
