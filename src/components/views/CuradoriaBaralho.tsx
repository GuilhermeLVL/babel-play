import { type CartaoFora, contarPorMotivo, type MotivoDescarte, ROTULO_MOTIVO, type Triagem } from '@core';
import { Archive, Check, CircleAlert, ListChecks, Loader2, PartyPopper, Pencil } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { updateCard } from '../../data/api';
import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { numero, t } from '../../lib/i18n';
import { langLabel } from '../../lib/languages';
import type { AgeProfileType } from '../../lib/profile';
import type { VocabCard } from '../../types';
import { toast } from '../Toast';
import { CabecalhoDeTela, IconeEmBloco, Tela, TituloDeSecao } from '../ui';
import { VoltarDoQuest } from './play/quest/pecasDoQuest';

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

/* "Está certo assim" não tem coluna no servidor: a decisão fica neste navegador, e o cartão (que
   nunca saiu do baralho) deixa de aparecer na curadoria. */
const CHAVE_MANTIDAS = 'curadoria.mantidas';
function lerMantidas(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_MANTIDAS) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function gravarMantida(id: string) {
  try {
    localStorage.setItem(CHAVE_MANTIDAS, JSON.stringify([...new Set([...lerMantidas(), id])]));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

export default function CuradoriaBaralho({ triagem, idioma, ageProfile, onVoltar, onMudou }: CuradoriaProps) {
  /** Ids já resolvidos nesta visita — somem da lista sem precisar recarregar tudo. */
  const [resolvidos, setResolvidos] = useState<Set<string>>(() => new Set(lerMantidas()));
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const questNovo = useQuestNovo();

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

  /** "Está certo assim": fica fora da curadoria (guardado neste navegador) e volta aos jogos como está. */
  const manter = async (card: VocabCard) => {
    gravarMantida(card.id);
    toast.ok(`“${card.word}” volta para os jogos como está`);
    await marcarResolvido(card.id);
  };

  /** Desfaz um arquivamento: o cartão volta ao baralho e à lista. */
  const desarquivar = async (ids: string[]) => {
    for (const id of ids) {
      try {
        await updateCard(id, { inDeck: true });
      } catch {
        /* o que falhar continua arquivado */
      }
    }
    setResolvidos((prev) => new Set([...prev].filter((x) => !ids.includes(x))));
    await onMudou();
  };

  const arquivar = async (card: VocabCard) => {
    setOcupado(card.id);
    try {
      await updateCard(card.id, { inDeck: false });
      toast.ok(`“${card.word}” arquivada: saiu dos jogos.`, {
        action: { label: 'Desfazer', onClick: () => void desarquivar([card.id]) },
      });
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
    setOcupado(`grupo:${motivo}`);
    let gravadas = 0;
    const arquivadas: string[] = [];
    try {
      /* Em série e não em `Promise.all`: são centenas de PATCH, e disparar tudo de uma vez sobre o
         servidor local significa esgotar o pool de conexões e receber falhas que não são do dado.
         Devagar e contando é melhor que rápido e sem saber quantas entraram. */
      for (const { card } of itens) {
        try {
          await updateCard(card.id, { inDeck: false });
          gravadas++;
          arquivadas.push(card.id);
        } catch {
          /* conta só as que entraram */
        }
      }
      setResolvidos((prev) => new Set([...prev, ...itens.map((i) => i.card.id)]));
      await onMudou();
      // Sem confirmação antes (como no protótipo): nada é apagado, e o Desfazer traz todas de volta.
      const desfazer = { label: 'Desfazer', onClick: () => void desarquivar(arquivadas) };
      if (gravadas === itens.length) toast.ok(`${gravadas} arquivadas`, { action: desfazer, duration: 8000 });
      else
        toast.warn(`${gravadas} de ${itens.length} arquivadas, as outras falharam e continuam na lista`, {
          action: desfazer,
        });
    } finally {
      setOcupado(null);
    }
  };

  const salvarTraducao = async (card: VocabCard) => {
    const nova = rascunho.trim();
    if (!nova) {
      toast.warn('Escreva uma tradução curta');
      return;
    }
    setOcupado(card.id);
    try {
      await updateCard(card.id, { translation: nova });
      toast.ok(`“${card.word}” = ${nova}: volta para os jogos`);
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

  /* META QUEST (segunda rodada, 01/10/2026): a mesma curadoria nas peças do headset. Cada palavra é
     uma linha com as três ações ESCRITAS (editar, arquivar, está certo): no headset não há dica ao
     parar o ponteiro, então ícone sozinho não diz o que faz. As ações são as mesmas funções acima. */
  if (questNovo) {
    return (
      <div className="q-palco qj qj-tela quest-curadoria" data-testid="curadoria-do-quest">
        <div className="q-cab">
          <VoltarDoQuest rotulo={t('Voltar para Jogar')} aoClicar={onVoltar} />
          <div>
            <p className="q-sobre">{t('Curadoria do baralho')}</p>
            <h1>{ageProfile === 'kids' ? t('Arrumar as palavras') : t('Palavras que ficaram de fora')}</h1>
          </div>
        </div>
        <p className="qj-nota">
          {t(
            'Elas não entram nos jogos por um motivo que dá para consertar em um toque. Nada é apagado: arquivar só tira dos jogos.',
          )}
        </p>

        <div className="q-grade g4">
          <div className="q-num" data-tom="bom">
            <b>{numero(triagem.usaveis.length)}</b>
            <span>{t('Prontas para jogar')}</span>
          </div>
          <div className="q-num" data-tom="alerta">
            <b>{numero(pendentes.length)}</b>
            <span>{t('Separadas aqui')}</span>
          </div>
          <div className="q-num">
            <b>{numero(triagem.outroIdioma.length)}</b>
            <span>
              {t('Em outro idioma')}
              {/* No computador isto é uma dica ao parar o ponteiro; aqui fica escrito. */}
              <small className="qj-nota-curta">
                {t('Estão certas, só não são de {idioma}', { idioma: langLabel(idioma) || t('este idioma') })}
              </small>
            </span>
          </div>
          <div className="q-num" data-tom="acento">
            <b>{total > 0 ? `${Math.round((triagem.usaveis.length / total) * 100)}%` : '—'}</b>
            <span>{t('Do baralho joga')}</span>
          </div>
        </div>

        {pendentes.length === 0 ? (
          <div className="q-vazio">
            <span className="q-ic" aria-hidden>
              <PartyPopper />
            </span>
            <h2>{t('Nada para revisar')}</h2>
            <p>{t('Todas as palavras do baralho entram nos jogos.')}</p>
            <button type="button" className="q-ctl pri" onClick={onVoltar}>
              {t('Voltar aos jogos')}
            </button>
          </div>
        ) : (
          grupos.map(({ motivo, itens }) => (
            <section key={motivo} className="q-secao" data-motivo={motivo}>
              <header>
                <div>
                  <h2>
                    {t(ROTULO_MOTIVO[motivo].titulo)} <span className="qj-n">{numero(contagem[motivo])}</span>
                  </h2>
                  <p>{t(ROTULO_MOTIVO[motivo].conserto)}</p>
                </div>
                {itens.length >= 3 && (
                  <button
                    type="button"
                    className="q-ctl"
                    onClick={() => void arquivarGrupo(motivo, itens)}
                    disabled={ocupado === `grupo:${motivo}`}
                  >
                    {ocupado === `grupo:${motivo}` ? (
                      <>
                        <Loader2 className="animate-spin" aria-hidden /> {t('Arquivando…')}
                      </>
                    ) : (
                      <>
                        <Archive aria-hidden /> {t('Arquivar as {n}', { n: numero(itens.length) })}
                      </>
                    )}
                  </button>
                )}
              </header>

              <ul className="qj-lista">
                {itens.slice(0, 40).map(({ card }: CartaoFora) => (
                  <li key={card.id} className="q-ajuste">
                    <div>
                      <b>{card.word}</b>
                      <small>{card.translation || t('sem tradução')}</small>
                    </div>
                    {editando === card.id ? (
                      <form
                        className="qj-edicao"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void salvarTraducao(card);
                        }}
                      >
                        <label className="q-campo">
                          <span>{t('Tradução curta de {palavra}', { palavra: card.word })}</span>
                          <input
                            id={`cur-in-${card.id}`}
                            autoFocus
                            value={rascunho}
                            onChange={(e) => setRascunho(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setEditando(null);
                                setRascunho('');
                              }
                            }}
                            placeholder={t('tradução curta')}
                          />
                        </label>
                        <span className="q-acoes">
                          <button type="submit" className="q-ctl" disabled={ocupado === card.id}>
                            <Check aria-hidden /> {t('Salvar')}
                          </button>
                          <button
                            type="button"
                            className="q-ctl"
                            onClick={() => {
                              setEditando(null);
                              setRascunho('');
                            }}
                          >
                            {t('Cancelar')}
                          </button>
                        </span>
                      </form>
                    ) : (
                      <span className="q-acoes">
                        <button
                          type="button"
                          className="q-ctl"
                          onClick={() => {
                            setEditando(card.id);
                            setRascunho(card.translation || '');
                          }}
                          aria-label={t('Editar a tradução de {palavra}', { palavra: card.word })}
                        >
                          <Pencil aria-hidden /> {t('Editar')}
                        </button>
                        <button
                          type="button"
                          className="q-ctl"
                          onClick={() => void arquivar(card)}
                          disabled={ocupado === card.id}
                          aria-label={t('Arquivar {palavra}', { palavra: card.word })}
                        >
                          <Archive aria-hidden /> {t('Arquivar')}
                        </button>
                        <button
                          type="button"
                          className="q-ctl"
                          onClick={() => void manter(card)}
                          aria-label={t('{palavra} está certo assim', { palavra: card.word })}
                        >
                          <Check aria-hidden /> {t('Está certo')}
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {itens.length > 40 && (
                <p className="qj-nota">
                  {t('Mostrando 40 de {n}. Resolva estas e as próximas aparecem.', { n: numero(itens.length) })}
                </p>
              )}
            </section>
          ))
        )}
      </div>
    );
  }

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
                      <button type="submit" className="btn btn-solid peq" disabled={ocupado === card.id}>
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
                          aria-label={`Editar a tradução de ${card.word}`}
                        >
                          <Pencil aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline peq icone"
                          onClick={() => void arquivar(card)}
                          disabled={ocupado === card.id}
                          aria-label={`Arquivar ${card.word}`}
                        >
                          <Archive aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline peq icone"
                          onClick={() => void manter(card)}
                          aria-label={`${card.word} está certo assim`}
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
