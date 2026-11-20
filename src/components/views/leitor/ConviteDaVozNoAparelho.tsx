import { useEffect, useId, useState, useSyncExternalStore } from 'react';

import { MB_DO_SUPERTONIC } from '../../../core/voz/supertonic';
import { t } from '../../../lib/i18n';
import { escolherVoz } from '../../../lib/voz/preferenciaDeVoz';
import {
  aoMudarVozNoAparelho,
  aquecerVozNoAparelho,
  baixarVozNoAparelho,
  cancelarDownloadDaVozNoAparelho,
  contextoDaVozNoAparelho,
  decisaoDaVozNoAparelho,
  estadoDaVozNoAparelho,
  recusarConviteDaVozNoAparelho,
  VOZ_NO_APARELHO,
} from '../../../lib/voz/vozNoAparelho';

type Fase = 'convite' | 'baixando' | 'preparando' | 'pronta' | 'erro' | 'fechado';

/** Quanto o "Pronto" fica à vista antes de o cartão sair sozinho. */
const PRONTA_POR_MS = 6000;

const mb = (bytes: number) => Math.round(bytes / 1_000_000);

/**
 * O CONVITE DA VOZ NO APARELHO, dentro da barra do narrador (primeiro contato, openspec `voz-no-aparelho`). Quem o
 * desenha já decidiu que ele vale (`conviteDaVozNoAparelho`): o portão permite, o modelo não está aqui, sem áudio gravado
 * e sem recusa nos últimos 30 dias. A leitura NÃO para: a voz do sistema segue lendo enquanto o cartão está à vista.
 *
 *  · "Baixar e usar": baixa em segundo plano (progresso e cancelar), carrega o modelo, guarda a voz como a escolha do
 *    idioma e chama `aoFicarPronta` (o narrador troca no próximo limite de frase).
 *  · "Agora não": não volta neste aparelho por 30 dias; a opção segue em "Voz e modo".
 *  · Falha: diz o fato e a saída, a leitura continua.
 *
 * Não é modal (`role="region"` rotulada), não rouba o foco; as mudanças de fase saem num `aria-live="polite"`.
 */
export default function ConviteDaVozNoAparelho({
  idioma,
  aoFicarPronta,
}: {
  idioma: string;
  aoFicarPronta: () => void;
}) {
  /* A barra pode fechar e reabrir no meio do download (que segue no módulo): o cartão novo mostra o progresso. */
  const [fase, setFase] = useState<Fase>(() => (estadoDaVozNoAparelho().fase === 'baixando' ? 'baixando' : 'convite'));
  const estado = useSyncExternalStore(aoMudarVozNoAparelho, estadoDaVozNoAparelho);
  const titulo = useId();
  const avisoDeMemoria = decisaoDaVozNoAparelho().avisoDeMemoria;
  const [meuDownload, setMeuDownload] = useState(false);

  useEffect(() => {
    if (fase !== 'pronta') return;
    const id = window.setTimeout(() => setFase('fechado'), PRONTA_POR_MS);
    return () => window.clearTimeout(id);
  }, [fase]);
  /* O download que este cartão não começou terminou: quem o começou já trocou a voz (ou falhou). */
  useEffect(() => {
    if (fase === 'baixando' && !meuDownload && estado.fase !== 'baixando')
      setFase(estado.fase === 'erro' ? 'erro' : 'fechado');
  }, [fase, meuDownload, estado.fase]);

  if (fase === 'fechado') return null;

  const baixar = async () => {
    /* O toque destrava o áudio da voz nova (o Safari só toca Web Audio liberado num gesto). */
    try {
      void contextoDaVozNoAparelho()
        .resume()
        .catch(() => undefined);
    } catch {
      /* sem Web Audio: a reserva lê */
    }
    setMeuDownload(true);
    setFase('baixando');
    const ok = await baixarVozNoAparelho();
    if (!ok) {
      setFase(estadoDaVozNoAparelho().fase === 'erro' ? 'erro' : 'fechado'); // cancelar fecha, sem aviso
      return;
    }
    setFase('preparando');
    try {
      await aquecerVozNoAparelho();
    } catch {
      setFase('erro');
      return;
    }
    void escolherVoz(idioma, VOZ_NO_APARELHO).catch(() => false); // vale na hora no aparelho; a conta vem depois
    setFase('pronta');
    aoFicarPronta();
  };

  const recusar = () => {
    recusarConviteDaVozNoAparelho();
    setFase('fechado');
  };

  const total = estado.total || MB_DO_SUPERTONIC * 1_000_000;
  const anuncio =
    fase === 'baixando'
      ? t('Baixando a voz de alta qualidade. A leitura continua.')
      : fase === 'preparando'
        ? t('Preparando a voz…')
        : fase === 'pronta'
          ? t('Pronto: a próxima frase já sai na voz nova.')
          : fase === 'erro'
            ? t('A leitura continua com a voz do sistema. Tente baixar de novo em Voz e modo.')
            : '';

  return (
    <div
      className="leitor-convite-voz"
      role="region"
      aria-labelledby={titulo}
      data-testid="convite-voz-no-aparelho"
      data-fase={fase}
    >
      <p id={titulo} className="leitor-convite-voz-titulo">
        <b>{t('Quer uma voz mais natural?')}</b>
      </p>
      {fase === 'convite' && (
        <>
          <p className="leitor-convite-voz-texto">
            {t('Baixa uma vez (≈ {mb} MB), fica só neste aparelho e depois funciona sem internet.', {
              mb: MB_DO_SUPERTONIC,
            })}
            {avisoDeMemoria && ` ${t('Usa cerca de 2 a 3 GB de memória enquanto lê.')}`}
            {` ${t('Começa com a voz Feminina 1; as outras 9 ficam em Voz e modo.')}`}
          </p>
          <div className="leitor-convite-voz-acoes">
            <button
              type="button"
              className="btn btn-solid leitor-alvo"
              data-testid="convite-voz-baixar"
              onClick={() => void baixar()}
            >
              {t('Baixar e usar')}
            </button>
            <button
              type="button"
              className="btn btn-outline leitor-alvo"
              data-testid="convite-voz-agora-nao"
              onClick={recusar}
            >
              {t('Agora não')}
            </button>
          </div>
        </>
      )}
      {(fase === 'baixando' || fase === 'preparando') && (
        <div className="leitor-convite-voz-acoes">
          <progress
            value={fase === 'preparando' ? total : estado.recebidos}
            max={total}
            aria-label={t('Baixando a voz de alta qualidade')}
          />
          <span className="leitor-convite-voz-texto" data-testid="convite-voz-progresso">
            {fase === 'preparando'
              ? t('Preparando a voz…')
              : t('Baixando: {feito} de {total} MB.', { feito: mb(estado.recebidos), total: mb(total) })}
          </span>
          {fase === 'baixando' && (
            <button
              type="button"
              className="btn btn-outline leitor-alvo"
              data-testid="convite-voz-cancelar"
              onClick={cancelarDownloadDaVozNoAparelho}
            >
              {t('Cancelar')}
            </button>
          )}
        </div>
      )}
      {(fase === 'pronta' || fase === 'erro') && (
        <div className="leitor-convite-voz-acoes">
          <p className="leitor-convite-voz-texto" data-testid="convite-voz-resultado">
            {anuncio}
          </p>
          <button type="button" className="btn btn-outline leitor-alvo" onClick={() => setFase('fechado')}>
            {t('Fechar')}
          </button>
        </div>
      )}
      <p className="sr" aria-live="polite">
        {anuncio}
      </p>
    </div>
  );
}
