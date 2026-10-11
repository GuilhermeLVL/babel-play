import { Check, Info, Keyboard } from 'lucide-react';
import { useEffect, useState } from 'react';

import { fetchMemoriaDoCartao } from '../../../../data/api';
import { numeroCom, t } from '../../../../lib/i18n';
import type { VocabCard } from '../../../../types';
import { Dialogo, fecharDialogoDe } from '../../../ui';

const umaCasa = (n: number): string => numeroCom(n, { maximumFractionDigits: 1 });

/**
 * INFORMAÇÕES DO CARTÃO — porte de `ctInfoDoCartao()` (`cartoes2.js:498-507`), com o que o app sabe de
 * verdade: o estado, a memória do cartão (estabilidade, dificuldade, erros) e a contagem de revisões e
 * acertos (`GET /api/vocab/:id/memoria`). A tabela de revisões, uma a uma, do protótipo NÃO entra: o
 * servidor não tem rota que liste o histórico de um cartão.
 */
export function InfoDoCartao({ cartao, baralho, aoFechar }: { cartao: VocabCard; baralho: string; aoFechar: () => void }) {
  const [memoria, setMemoria] = useState<{ revisoes: number; acertos: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    void fetchMemoriaDoCartao(cartao.id).then((m) => vivo && setMemoria(m));
    return () => {
      vivo = false;
    };
  }, [cartao.id]);
  const extra = cartao as VocabCard & { lapses?: number | null; stability?: number | null; difficulty?: number | null };
  const visto = !!cartao.lastReview;
  const estado = {
    New: t('Nova'),
    Learning: t('Aprendendo'),
    Review: t('Em revisão'),
    Relearning: t('Reaprendendo'),
  }[cartao.fsrsState];
  const estabilidade = extra.stability ?? cartao.fsrsStability;
  const dificuldade = extra.difficulty ?? cartao.fsrsDifficulty;
  const medidas: Array<[string, string]> = [
    [t('Estado'), estado ?? '—'],
    [t('Origem'), baralho],
    [
      t('Estabilidade'),
      visto && estabilidade ? t('{n} dias', { n: umaCasa(estabilidade) }) : t('ainda não há'),
    ],
    [t('Dificuldade'), visto && dificuldade ? t('{n} de 10', { n: umaCasa(dificuldade) }) : t('ainda não há')],
    [t('Erros'), String(extra.lapses ?? 0)],
    [t('Revisões'), memoria ? String(memoria.revisoes) : '…'],
    [t('Acertos'), memoria ? String(memoria.acertos) : '…'],
  ];
  return (
    <Dialogo
      icone={Info}
      titulo={t('Informações do cartão')}
      sub={`${cartao.word} · ${cartao.translation || '—'}`}
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo">
        <dl className="q-medidas duas">
          {medidas.map(([k, v]) => (
            <div key={k} className="q-medida">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {memoria && memoria.revisoes === 0 && <p className="q-texto">{t('Palavra nova: ainda não tem histórico.')}</p>}
      </div>
      <div className="dlg-pe">
        <button type="button" className="q-ctl pri" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          <Check aria-hidden /> {t('Fechar')}
        </button>
      </div>
    </Dialogo>
  );
}

/**
 * ATALHOS DA REVISÃO — o grupo "revisão" de `ctAbrirAtalhos()` (`cartoes3.js:297-306`), só com as
 * teclas que o app atende (`Study.tsx`).
 */
export function AtalhosDaRevisao({
  doisBotoes,
  temMinhaVoz,
  aoFechar,
}: {
  doisBotoes: boolean;
  temMinhaVoz: boolean;
  aoFechar: () => void;
}) {
  const linhas: Array<[string, string[]]> = [
    [t('Mostrar a resposta'), [t('Espaço')]],
    [t('Dar a nota'), doisBotoes ? ['1', '2'] : ['1', '2', '3', '4']],
    [t('Desfazer a última nota'), ['Z']],
    [t('Ouvir a fala original (ou a voz do aparelho)'), ['R']],
    [t('Ouvir na voz do aparelho'), ['V']],
    ...(temMinhaVoz ? ([[t('Minha voz (no verso)'), ['M']]] as Array<[string, string[]]>) : []),
    [t('Outra frase'), ['N']],
    [t('Editar o cartão'), ['E']],
    [t('Deixar para amanhã'), ['-']],
    [t('Suspender'), ['S']],
    [t('Informações do cartão'), ['I']],
    [t('Esta lista'), ['?']],
  ];
  return (
    <Dialogo
      icone={Keyboard}
      titulo={t('Atalhos e gestos')}
      sub={t('As teclas da revisão. No celular: tocar vira, deslizar dá a nota, segurar abre as ações.')}
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo">
        <div className="q-inst ct-atalhos-corpo">
          <section className="q-cartao q-inst-atalhos">
            <h3>{t('Revisão')}</h3>
            <div>
              {linhas.map(([rotulo, teclas]) => (
                <div key={rotulo} className="entre atalho">
                  <span>{rotulo}</span>
                  <span>
                    {teclas.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <div className="dlg-pe">
        <button type="button" className="q-ctl pri" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          <Check aria-hidden /> {t('Fechar')}
        </button>
      </div>
    </Dialogo>
  );
}
