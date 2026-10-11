import { ArrowLeft, AudioLines, Film, Moon, Repeat, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { data, t, tp } from '../../../../lib/i18n';
import { chegarFilhos } from '../../../../lib/polimento/revisao';
import { sentir } from '../../../../lib/polimento/sentidos';
import type { OrigemDoCartao } from '../../../../lib/revisao/cena';
import FolhaDeBaixo from '../../captura/celular/FolhaDeBaixo';
import { CabecalhoDaFolha, Cena, FraseMarcada } from './pecas';

/** Quantos dias a palavra descansa (`cxSaidas`, `cartoes2.js:569`). */
export const DIAS_DE_DESCANSO = 30;

/**
 * PALAVRA QUE NÃO ENTRA — porte de `cxSaidas()` (`cartoes2.js:558-623`): saídas úteis no lugar de só
 * "suspender".
 *
 * AS QUE O APP CUMPRE: trocar a frase (quando a palavra apareceu em outra frase), rever a cena (quando
 * o cartão nasceu de uma captura) e descansar 30 dias (o cartão só volta a vencer naquela data; a
 * memória dele não muda). "Escrever um lembrete seu" NÃO entra: o cartão não tem campo de nota.
 */
export default function FolhaDasSaidas({
  palavra,
  traducao,
  idioma,
  lapsos,
  origem,
  aoTrocarFrase,
  aoOuvirCena,
  aoDescansar,
  aoFechar,
}: {
  palavra: string;
  traducao: string;
  idioma: string;
  lapsos: number;
  /** `null` enquanto a origem do cartão é lida. */
  origem: OrigemDoCartao | null;
  aoTrocarFrase: (frase: string) => void;
  aoOuvirCena?: () => void;
  aoDescansar: () => void;
  aoFechar: () => void;
}) {
  const folha = useRef<HTMLDialogElement>(null);
  const depois = useRef<(() => void) | null>(null);
  const [vendoCena, setVendoCena] = useState(false);
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    chegarFilhos(folha.current?.querySelector<HTMLElement>('.folha-corpo') ?? null);
  }, [vendoCena]);

  const outra = origem?.outrasFrases[0];
  const cena = origem?.cena ?? null;
  const volta = data(Date.now() + DIAS_DE_DESCANSO * 86_400_000, { day: 'numeric', month: 'long' });
  const sair = (acao: () => void) => () => {
    depois.current = acao;
    folha.current?.close();
  };

  return (
    <FolhaDeBaixo
      titulo={t('Saídas para a palavra que não entra')}
      doPrototipo
      classe="cx-folha cx-folha-saidas"
      refDaFolha={folha}
      aoFechar={() => {
        const acao = depois.current;
        depois.current = null;
        aoFechar();
        if (acao) window.setTimeout(acao, 240);
      }}
    >
      {vendoCena && cena ? (
          <>
            <p className="folha-rotulo">{t('A cena de “{palavra}”', { palavra })}</p>
            <Cena cena={cena} semLink />
            <p className="folha-frase cx-frase-da-folha" lang={idioma}>
              “<FraseMarcada frase={cena.frase} palavra={palavra} />”
            </p>
            <p className="folha-frase-trad">
              {cena.traducao ? `“${cena.traducao}” · ` : ''}
              <b>{traducao}</b>
            </p>
            <div className="cx-folha-pe">
              <button
                type="button"
                className="q-ctl"
                onClick={() => {
                  sentir('aba');
                  setVendoCena(false);
                }}
              >
                <ArrowLeft aria-hidden /> {t('Outras saídas')}
              </button>
              {aoOuvirCena && (
                <button type="button" className="q-ctl pri" onClick={aoOuvirCena}>
                  {cena.temAudio ? <AudioLines aria-hidden /> : <Volume2 aria-hidden />}{' '}
                  {cena.temAudio && cena.quem ? t('Ouvir {quem}', { quem: cena.quem }) : t('Ouvir')}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <CabecalhoDaFolha aoFechar={() => folha.current?.close()}>
              <p className="folha-pal" lang={idioma}>
                {t('“{palavra}” não está entrando', { palavra })}
              </p>
              <p className="folha-glosa">
                {tp(lapsos, 'Já escapou {n} vez.', 'Já escapou {n} vezes.')}{' '}
                {t('Costuma ser o cartão, não você. Tente de outro jeito:')}
              </p>
            </CabecalhoDaFolha>
            <div className="cx-saidas">
              <button
                type="button"
                className="q-linha"
                disabled={!outra}
                onClick={outra && sair(() => aoTrocarFrase(outra.frase))}
              >
                <span className="q-ic">
                  <Repeat aria-hidden />
                </span>
                <span>
                  <b>{t('Trocar a frase')}</b>
                  <small>
                    {outra
                      ? `“${outra.frase}”${outra.titulo ? ` · ${outra.titulo}` : ''}`
                      : origem
                        ? t('Por enquanto esta palavra só apareceu uma vez nas suas capturas.')
                        : t('Procurando outras frases…')}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="q-linha"
                disabled={!cena}
                onClick={() => {
                  sentir('abre');
                  setVendoCena(true);
                  aoOuvirCena?.();
                }}
              >
                <span className="q-ic">
                  <Film aria-hidden />
                </span>
                <span>
                  <b>{t('Rever a cena')}</b>
                  <small>
                    {cena
                      ? cena.temAudio
                        ? t('O momento em que você ouviu a palavra, com a voz de quem falou.')
                        : t('O momento em que você ouviu a palavra, na sessão de onde ela veio.')
                      : origem
                        ? t('Este cartão não nasceu de uma captura.')
                        : t('Procurando a cena…')}
                  </small>
                </span>
              </button>
              <button type="button" className="q-linha" onClick={sair(aoDescansar)}>
                <span className="q-ic">
                  <Moon aria-hidden />
                </span>
                <span>
                  <b>{t('Descansar 30 dias')}</b>
                  <small>{t('Sai da fila e volta sozinha em {dia}. Dá para desfazer.', { dia: volta })}</small>
                </span>
              </button>
            </div>
          </>
      )}
    </FolhaDeBaixo>
  );
}
