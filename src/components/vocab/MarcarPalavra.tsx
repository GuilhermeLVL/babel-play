import '../../styles/etiquetas.css';

import { Check, EyeOff, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { chaveDaPalavra } from '../../core/texto/palavra';
import { estadoNoCaderno } from '../../core/vocabulario/etiquetas';
import { type EstadoDaMarcacao, estadoMarcado } from '../../core/vocabulario/marcadas';
import { desmarcarNoIndice, useSnapshotDasEtiquetas } from '../../lib/etiquetas/indiceDeEtiquetas';
import {
  alternarMarcacao,
  ouvirTeclaDeMarcacao,
  TECLA_CONHECIDA,
  TECLA_IGNORADA,
  teclaDeMarcacao,
} from '../../lib/etiquetas/teclasDeMarcacao';
import { t } from '../../lib/i18n';

/**
 * "JÁ SEI" E "IGNORAR" NO CARTÃO DA PALAVRA (openspec `vocab-conhecidas-e-ignoradas`): marcar sem criar cartão. Com a
 * palavra marcada, o cartão diz qual é a marcação e oferece "Desfazer". Palavra que já tem cartão no caderno não
 * mostra nada: o cartão manda (a régua está em `core/vocabulario/marcadas`). Os atalhos `k` e `x` valem enquanto este
 * bloco está montado, isto é, com o cartão aberto (`lib/etiquetas/teclasDeMarcacao`).
 *
 * Os botões têm só o texto visível como nome (sem `aria-label` diferente dele).
 */
export default function MarcarPalavra({
  palavra,
  lang,
  classeDoBotao,
}: {
  palavra: string;
  lang: string | undefined;
  /** A classe dos botões do cartão onde ele mora (os chips do leitor, as ações da legenda). */
  classeDoBotao: string;
}) {
  const s = useSnapshotDasEtiquetas();
  const [erro, setErro] = useState(false);
  /* As teclas leem a palavra da renderização atual, sem reinscrever o ouvinte a cada uma. */
  const alvo = useRef({ palavra, lang });
  alvo.current = { palavra, lang };
  useEffect(() => {
    const aplicar = (estado: EstadoDaMarcacao) => {
      setErro(false);
      void alternarMarcacao(alvo.current.palavra, alvo.current.lang, estado).then((r) => {
        if (r === false) setErro(true);
      });
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const estado = teclaDeMarcacao(e);
      if (!estado) return;
      e.preventDefault();
      aplicar(estado);
    };
    window.addEventListener('keydown', aoTeclar);
    const parar = ouvirTeclaDeMarcacao(aplicar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      parar();
    };
  }, []);
  const chave = chaveDaPalavra(palavra);
  if (!chave || !lang || estadoNoCaderno(s.caderno, chave, lang)) return null;
  const marcada = estadoMarcado(s.marcadas, chave, lang);

  const marcar = async (estado: EstadoDaMarcacao) => {
    setErro(false);
    if ((await alternarMarcacao(palavra, lang, estado)) === false) setErro(true);
  };
  const desfazer = async () => {
    setErro(false);
    if (!(await desmarcarNoIndice(chave, lang))) setErro(true);
  };

  return (
    <div className="marcar-palavra" role="group" aria-label={t('Marcar sem criar cartão')}>
      {marcada ? (
        <>
          <span className="marcar-palavra-estado" role="status">
            {marcada === 'conhecida' ? <Check aria-hidden /> : <EyeOff aria-hidden />}{' '}
            {marcada === 'conhecida' ? t('Você já sabe esta palavra') : t('Palavra ignorada')}
          </span>
          <button type="button" className={classeDoBotao} onClick={() => void desfazer()}>
            <Undo2 aria-hidden /> {t('Desfazer')}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={classeDoBotao}
            aria-keyshortcuts={TECLA_CONHECIDA}
            title={t('Atalho: {tecla}', { tecla: TECLA_CONHECIDA })}
            onClick={() => void marcar('conhecida')}
          >
            <Check aria-hidden /> {t('Já sei')}
          </button>
          <button
            type="button"
            className={classeDoBotao}
            aria-keyshortcuts={TECLA_IGNORADA}
            title={t('Atalho: {tecla}', { tecla: TECLA_IGNORADA })}
            onClick={() => void marcar('ignorada')}
          >
            <EyeOff aria-hidden /> {t('Ignorar')}
          </button>
        </>
      )}
      {erro && (
        <span className="marcar-palavra-erro" role="status">
          {t('Não deu para marcar agora.')}
        </span>
      )}
    </div>
  );
}
