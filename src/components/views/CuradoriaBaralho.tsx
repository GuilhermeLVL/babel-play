import { type CartaoFora, contarPorMotivo, type MotivoDescarte, ROTULO_MOTIVO, type Triagem } from '@core';
import { Archive, Check, CircleAlert, ListChecks, Loader2, PartyPopper, Pencil } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { updateCard } from '../../data/api';
import { numero } from '../../lib/i18n';
import { langLabel } from '../../lib/languages';
import type { AgeProfileType } from '../../lib/profile';
import type { VocabCard } from '../../types';
import { askConfirm, toast } from '../Toast';
import { CabecalhoDeTela, IconeEmBloco, Tela, TituloDeSecao } from '../ui';

/**
 * CURADORIA — o que ficou de fora das rodadas, e o que fazer com isso.
 *
 * POR QUE ESTA TELA EXISTE. O vocabulário nasce de fala capturada, e fala capturada é suja: das
 * 1.506 palavras deste baralho, 286 não servem de exercício — 194 são repetições, 72 têm a
 * "tradução" igual à própria palavra, 16 têm por definição um pedaço de fala como "Isso é". Elas
 * chegavam aos jogos e faziam a aplicação parecer quebrada funcionando.
 *
 * A DECISÃO É DE QUEM CAPTUROU, NÃO DA RÉGUA. Uma régua automática erra, e apagar em massa uma
 * palavra salva de propósito é o tipo de erro que não dá para desfazer de cabeça. Então a régua
 * SEPARA e explica; quem decide é a pessoa. Arquivar tira das rodadas sem apagar nada — o cartão
 * continua no banco, com `in_deck = 0`.
 *
 * A TERCEIRA PILHA (outro idioma) não aparece aqui de propósito: aqueles cartões estão perfeitos,
 * só não são desta rodada. Listá-los como problema mandaria a pessoa "consertar" o que está certo.
 */

interface CuradoriaProps {
  triagem: Triagem;
  idioma: string;
  ageProfile: AgeProfileType;
  onVoltar: () => void;
  /** Chamado depois de qualquer mudança, para a tela de jogos recarregar o baralho. */
  onMudou: () => void | Promise<void>;
}

/** Ordem dos grupos: do defeito mais fácil de consertar para o mais trabalhoso. */
const ORDEM: MotivoDescarte[] = [
  'traducao-igual',
  'sem-pista',
  'pista-ruim',
  'idioma-incerto',
  'duplicada',
  'gramatical',
  'palavra-ruido',
  'palavra-curta',
];

export default function CuradoriaBaralho({ triagem, idioma, ageProfile, onVoltar, onMudou }: CuradoriaProps) {
  /** Ids já resolvidos nesta visita — somem da lista sem precisar recarregar tudo. */
  const [resolvidos, setResolvidos] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  const pendentes = useMemo(() => triagem.fora.filter((f) => !resolvidos.has(f.card.id)), [triagem.fora, resolvidos]);
  const contagem = useMemo(() => contarPorMotivo(pendentes), [pendentes]);

  const grupos = useMemo(
    () =>
      ORDEM.map((motivo) => ({ motivo, itens: pendentes.filter((f) => f.motivo === motivo) })).filter(
        (g) => g.itens.length > 0,
      ),
    [pendentes],
  );

  const marcarResolvido = async (id: string) => {
    setResolvidos((prev) => new Set([...prev, id]));
    await onMudou();
  };

  const arquivar = async (card: VocabCard) => {
    setOcupado(card.id);
    try {
      await updateCard(card.id, { inDeck: false });
      toast.ok(`"${card.word}" saiu das rodadas`);
      await marcarResolvido(card.id);
    } catch (e) {
      toast.error(`Não consegui arquivar: ${(e as Error).message}`);
    } finally {
      setOcupado(null);
    }
  };

  /**
   * ARQUIVAR UM GRUPO INTEIRO — sem isto a tela não resolve o problema que ela existe para resolver.
   *
   * Medido no baralho real: 1.040 dos 1.710 cartões estão sem tradução. Tratar um por um, com um
   * clique cada, é trabalho que ninguém faz — e uma tela de curadoria que só arruma de um em um é,
   * na prática, uma tela que não arruma. O grupo já é homogêneo por construção (todos ali têm o
   * MESMO motivo), então a decisão em lote é a mesma decisão repetida, e não um atalho arriscado.
   *
   * CONTINUA SEM APAGAR NADA: `inDeck = false` tira do sorteio e o cartão fica guardado, igual ao
   * arquivar de um item. Por isso a confirmação diz o número e diz que é reversível — e é `danger`
   * porque mexer em centenas de linhas de uma vez merece uma pausa, mesmo sendo reversível.
   *
   * O RESULTADO É CONTADO, não presumido: quantas de fato foram gravadas. Uma falha de rede no
   * meio deixaria o número menor, e dizer "1.040 arquivadas" quando foram 300 seria mentir.
   */
  const arquivarGrupo = async (motivo: MotivoDescarte, itens: CartaoFora[]) => {
    const ok = await askConfirm({
      danger: true,
      title: `Arquivar ${itens.length} ${itens.length === 1 ? 'palavra' : 'palavras'}?`,
      detail:
        `Todas com o mesmo motivo: ${ROTULO_MOTIVO[motivo].titulo.toLowerCase()}. ` +
        'Elas saem das rodadas e continuam guardadas, nada é apagado, e dá para trazer de volta.',
      confirmLabel: 'Arquivar todas',
    });
    if (!ok) return;

    setOcupado(`grupo:${motivo}`);
    let gravadas = 0;
    try {
      /* Em série e não em `Promise.all`: são centenas de PATCH, e disparar tudo de uma vez sobre o
         servidor local significa esgotar o pool de conexões e receber falhas que não são do dado.
         Devagar e contando é melhor que rápido e sem saber quantas entraram. */
      for (const { card } of itens) {
        try {
          await updateCard(card.id, { inDeck: false });
          gravadas++;
        } catch {
          /* conta só as que entraram */
        }
      }
      setResolvidos((prev) => new Set([...prev, ...itens.map((i) => i.card.id)]));
      await onMudou();
      if (gravadas === itens.length) toast.ok(`${gravadas} saíram das rodadas`);
      else toast.warn(`${gravadas} de ${itens.length} arquivadas, as outras falharam e continuam na lista`);
    } finally {
      setOcupado(null);
    }
  };

  const salvarTraducao = async (card: VocabCard) => {
    const nova = rascunho.trim();
    if (!nova) return;
    setOcupado(card.id);
    try {
      await updateCard(card.id, { translation: nova });
      toast.ok(`"${card.word}" já pode jogar`);
      setEditando(null);
      setRascunho('');
      await marcarResolvido(card.id);
    } catch (e) {
      toast.error(`Não consegui salvar: ${(e as Error).message}`);
    } finally {
      setOcupado(null);
    }
  };

  const total = triagem.usaveis.length + pendentes.length;

  /* Marcação do protótipo aprovado (`T.curadoria` em docs/prototipos/consistencia-telas.html): o
     cabeçalho, os quatro ladrilhos do saldo e um `.cartao.p5.secao` por motivo, com o conserto
     escrito embaixo do título e a `.lista-cur` com editar / arquivar / manter em cada palavra. */
  return (
    <Tela largura="larga">
      <CabecalhoDeTela
        voltar={{ rotulo: 'Jogar', aoClicar: onVoltar }}
        sobrancelha="Curadoria do baralho"
        icone={ListChecks}
        titulo={ageProfile === 'kids' ? 'Arrumar as palavras' : 'Palavras que ficaram de fora'}
        sub="Elas não entram nos jogos por um motivo que dá para consertar em um clique. Nada é apagado: arquivar só tira dos jogos."
      />

      {/* O SALDO, para a pessoa saber se a régua está sendo justa com o material dela. "Em outro
          idioma" não é problema: aqueles cartões estão certos, só não são desta rodada. */}
      <div className="ladrilhos">
        <div className="cartao ladrilho">
          <span className="label-mono">Prontas para jogar</span>
          <span className="v good">{numero(triagem.usaveis.length)}</span>
        </div>
        <div className="cartao ladrilho">
          <span className="label-mono">Separadas aqui</span>
          <span className="v warn">{numero(pendentes.length)}</span>
        </div>
        <div className="cartao ladrilho" title={`Estão certas, só não são de ${langLabel(idioma) || 'este idioma'}`}>
          <span className="label-mono">Em outro idioma</span>
          <span className="v">{numero(triagem.outroIdioma.length)}</span>
        </div>
        <div className="cartao ladrilho">
          <span className="label-mono">Do baralho joga</span>
          <span className="v acc">{total > 0 ? `${Math.round((triagem.usaveis.length / total) * 100)}%` : '—'}</span>
        </div>
      </div>

      {pendentes.length === 0 ? (
        <section className="cartao secao">
          <div className="vazio">
            <IconeEmBloco icone={PartyPopper} />
            <h3>Nada para revisar</h3>
            <p>Todas as palavras do baralho entram nos jogos.</p>
            <button type="button" className="btn btn-solid" onClick={onVoltar}>
              Voltar aos jogos
            </button>
          </div>
        </section>
      ) : (
        grupos.map(({ motivo, itens }) => (
          <section key={motivo} className="cartao p5 secao">
            {/* O CONSERTO vem escrito, para a pessoa não ter de deduzir o que fazer. A ação em lote
                fica no CABEÇALHO do grupo, onde a pessoa lê o motivo e decide — e só a partir de 3
                itens: com dois, o botão de lote é mais clique do que arquivar cada um. */}
            <TituloDeSecao
              icone={CircleAlert}
              titulo={
                <>
                  {ROTULO_MOTIVO[motivo].titulo} <span className="n-sec">{numero(contagem[motivo])}</span>
                </>
              }
              desc={ROTULO_MOTIVO[motivo].conserto}
              direita={
                itens.length >= 3 ? (
                  <button
                    type="button"
                    className="btn btn-outline peq"
                    onClick={() => void arquivarGrupo(motivo, itens)}
                    disabled={ocupado === `grupo:${motivo}`}
                    title={`Tirar dos jogos as ${itens.length} palavras deste grupo (não apaga)`}
                  >
                    {ocupado === `grupo:${motivo}` ? (
                      <>
                        <Loader2 className="animate-spin" aria-hidden /> Arquivando…
                      </>
                    ) : (
                      <>
                        <Archive aria-hidden /> Arquivar as {numero(itens.length)}
                      </>
                    )}
                  </button>
                ) : undefined
              }
            />

            <ul className="lista-cur">
              {itens.slice(0, 40).map(({ card }: CartaoFora) => (
                <li key={card.id}>
                  <b>{card.word}</b>
                  {editando === card.id ? (
                    <form
                      className="linha"
                      style={{ gap: 8, flex: 1 }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void salvarTraducao(card);
                      }}
                    >
                      <label className="sr" htmlFor={`cur-in-${card.id}`}>
                        Tradução curta de {card.word}
                      </label>
                      <input
                        id={`cur-in-${card.id}`}
                        className="campo"
                        autoFocus
                        value={rascunho}
                        onChange={(e) => setRascunho(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setEditando(null);
                            setRascunho('');
                          }
                        }}
                        placeholder="tradução curta"
                        style={{ minHeight: 36 }}
                      />
                      <button
                        type="submit"
                        className="btn btn-solid peq"
                        disabled={!rascunho.trim() || ocupado === card.id}
                      >
                        <Check aria-hidden /> Salvar
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline peq"
                        onClick={() => {
                          setEditando(null);
                          setRascunho('');
                        }}
                      >
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="mut" style={{ flex: 1 }} title={card.translation || undefined}>
                        {card.translation || <i>sem tradução</i>}
                      </span>
                      <span className="linha" style={{ gap: 4 }}>
                        <button
                          type="button"
                          className="btn btn-outline peq icone"
                          onClick={() => {
                            setEditando(card.id);
                            setRascunho(card.translation || '');
                          }}
                          title="Escrever a tradução"
                          aria-label={`Corrigir a tradução de ${card.word}`}
                        >
                          <Pencil aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline peq icone"
                          onClick={() => void arquivar(card)}
                          disabled={ocupado === card.id}
                          title="Tirar dos jogos (não apaga)"
                          aria-label={`Arquivar ${card.word}`}
                        >
                          <Archive aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline peq icone"
                          onClick={() => void marcarResolvido(card.id)}
                          title="Está certo assim, só não mostrar mais"
                          aria-label={`Manter ${card.word}`}
                        >
                          <Check aria-hidden />
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>

            {/* Teto de 40 por grupo, dito em voz alta: lista silenciosamente cortada mente. */}
            {itens.length > 40 && (
              <p className="mut" style={{ fontSize: 12.5, marginTop: 12 }}>
                Mostrando 40 de {numero(itens.length)}. Resolva estas e as próximas aparecem.
              </p>
            )}
          </section>
        ))
      )}
    </Tela>
  );
}
