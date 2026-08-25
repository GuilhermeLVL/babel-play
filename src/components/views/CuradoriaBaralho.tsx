import React, { useMemo, useState } from 'react';
import { ArrowLeft, Archive, Check, Pencil, Languages, Info, Loader2 } from 'lucide-react';
import { contarPorMotivo, ROTULO_MOTIVO, type Triagem, type MotivoDescarte, type CartaoFora } from '@core';
import { updateCard } from '../../data/api';
import type { VocabCard } from '../../types';
import type { AgeProfileType } from '../../lib/profile';
import { langLabel } from '../../lib/languages';
import { toast, askConfirm } from '../Toast';

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
  'traducao-igual', 'sem-pista', 'pista-ruim', 'idioma-incerto',
  'duplicada', 'gramatical', 'palavra-ruido', 'palavra-curta',
];

export default function CuradoriaBaralho({ triagem, idioma, ageProfile, onVoltar, onMudou }: CuradoriaProps) {
  /** Ids já resolvidos nesta visita — somem da lista sem precisar recarregar tudo. */
  const [resolvidos, setResolvidos] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  const pendentes = useMemo(
    () => triagem.fora.filter(f => !resolvidos.has(f.card.id)),
    [triagem.fora, resolvidos],
  );
  const contagem = useMemo(() => contarPorMotivo(pendentes), [pendentes]);

  const grupos = useMemo(
    () => ORDEM.map(motivo => ({ motivo, itens: pendentes.filter(f => f.motivo === motivo) }))
      .filter(g => g.itens.length > 0),
    [pendentes],
  );

  const marcarResolvido = async (id: string) => {
    setResolvidos(prev => new Set([...prev, id]));
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
    } finally { setOcupado(null); }
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
      detail: `Todas com o mesmo motivo: ${ROTULO_MOTIVO[motivo].titulo.toLowerCase()}. `
        + 'Elas saem das rodadas e continuam guardadas — nada é apagado, e dá para trazer de volta.',
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
        try { await updateCard(card.id, { inDeck: false }); gravadas++; } catch { /* conta só as que entraram */ }
      }
      setResolvidos(prev => new Set([...prev, ...itens.map(i => i.card.id)]));
      await onMudou();
      if (gravadas === itens.length) toast.ok(`${gravadas} saíram das rodadas`);
      else toast.warn(`${gravadas} de ${itens.length} arquivadas — as outras falharam e continuam na lista`);
    } finally { setOcupado(null); }
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
    } finally { setOcupado(null); }
  };

  const total = triagem.usaveis.length + pendentes.length;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 pb-28 animate-in fade-in duration-200">
      <header className="mb-6">
        <button
          onClick={onVoltar}
          className="flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink mb-3 py-1 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar aos jogos
        </button>
        <h1 className="font-display font-black text-2xl text-ink tracking-tight">
          {ageProfile === 'kids' ? 'Arrumar as palavras' : 'Curadoria do baralho'}
        </h1>
        <p className="text-[13px] text-ink-muted mt-1 max-w-[70ch]">
          Estas <b>{pendentes.length}</b> não entram nas rodadas de {langLabel(idioma) || 'nenhum idioma'} —
          e abaixo está o motivo de cada uma. <b>Nada foi apagado.</b> Arquivar só tira do sorteio;
          o cartão continua guardado.
        </p>
      </header>

      {/* O SALDO, para a pessoa saber se a régua está sendo justa com o material dela. */}
      <section className="card-panel bg-surface p-4 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
        <span className="font-bold text-good-ink">{triagem.usaveis.length} prontas para jogar</span>
        <span className="text-ink-muted">{pendentes.length} separadas aqui</span>
        {triagem.outroIdioma.length > 0 && (
          <span className="text-ink-muted flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5" aria-hidden />
            {triagem.outroIdioma.length} em outro idioma — estas estão certas, só não são desta rodada
          </span>
        )}
        {total > 0 && (
          <span className="text-ink-faint ml-auto">
            {Math.round((triagem.usaveis.length / total) * 100)}% do baralho joga
          </span>
        )}
      </section>

      {pendentes.length === 0 ? (
        <section className="card-panel bg-surface p-8 text-center flex flex-col items-center gap-3">
          <span className="w-14 h-14 rounded-2xl bg-good-soft flex items-center justify-center">
            <Check className="w-7 h-7 text-good-ink" aria-hidden />
          </span>
          <p className="font-display font-extrabold text-[17px] text-ink">Nada para revisar</p>
          <p className="text-[13px] text-ink-muted max-w-[46ch]">
            Todas as palavras deste idioma passaram na régua.
          </p>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          {grupos.map(({ motivo, itens }) => (
            <section key={motivo}>
              <div className="flex items-baseline gap-2 mb-2">
                <h2 className="font-display font-extrabold text-[15px] text-ink">
                  {ROTULO_MOTIVO[motivo].titulo}
                </h2>
                <span className="text-[12px] font-bold text-ink-muted">{contagem[motivo]}</span>
                {/* A ação em lote fica no CABEÇALHO do grupo, não no rodapé: é aqui que a pessoa lê
                    o motivo e decide. E só aparece a partir de 3 itens — com dois, o botão de lote
                    é mais clique do que arquivar cada um. */}
                {itens.length >= 3 && (
                  <button
                    onClick={() => void arquivarGrupo(motivo, itens)}
                    disabled={ocupado === `grupo:${motivo}`}
                    className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-warn-ink underline py-1 disabled:opacity-40 cursor-pointer"
                    title={`Tirar das rodadas as ${itens.length} palavras deste grupo (não apaga)`}
                  >
                    {ocupado === `grupo:${motivo}`
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> arquivando…</>
                      : <><Archive className="w-3.5 h-3.5" /> arquivar as {itens.length}</>}
                  </button>
                )}
              </div>
              {/* O CONSERTO vem escrito, para a pessoa não ter de deduzir o que fazer. */}
              <p className="flex items-start gap-1.5 text-[12px] text-ink-muted mb-2.5 max-w-[64ch]">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                {ROTULO_MOTIVO[motivo].conserto}
              </p>

              <ul className="flex flex-col gap-1.5">
                {itens.slice(0, 40).map(({ card }: CartaoFora) => (
                  <li
                    key={card.id}
                    className="card-panel bg-surface p-3 flex flex-wrap items-center gap-x-3 gap-y-2"
                  >
                    <span className="font-display font-bold text-[14px] text-ink min-w-[8rem]">{card.word}</span>
                    <span className="text-[12px] text-ink-muted flex-1 min-w-[10rem] truncate" title={card.translation}>
                      {card.translation || <i className="text-ink-faint">sem tradução</i>}
                    </span>

                    {editando === card.id ? (
                      <span className="flex items-center gap-1.5 w-full sm:w-auto">
                        <input
                          autoFocus
                          value={rascunho}
                          onChange={e => setRascunho(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') void salvarTraducao(card);
                            if (e.key === 'Escape') { setEditando(null); setRascunho(''); }
                          }}
                          placeholder="tradução curta"
                          className="flex-1 min-w-[9rem] px-2.5 py-1.5 rounded-lg bg-canvas border border-border-subtle text-[13px] text-ink focus:border-accent outline-none"
                        />
                        <button
                          onClick={() => void salvarTraducao(card)}
                          disabled={!rascunho.trim() || ocupado === card.id}
                          className="px-3 py-1.5 rounded-lg bg-accent text-white font-bold text-[12px] disabled:opacity-40 cursor-pointer"
                        >
                          Salvar
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 ml-auto">
                        <button
                          onClick={() => { setEditando(card.id); setRascunho(card.translation || ''); }}
                          className="p-2 rounded-lg text-ink-muted hover:text-accent hover:bg-surface-hover cursor-pointer"
                          title="Escrever a tradução"
                          aria-label={`Corrigir a tradução de ${card.word}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void arquivar(card)}
                          disabled={ocupado === card.id}
                          className="p-2 rounded-lg text-ink-muted hover:text-warn-ink hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
                          title="Tirar das rodadas (não apaga)"
                          aria-label={`Arquivar ${card.word}`}
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void marcarResolvido(card.id)}
                          className="p-2 rounded-lg text-ink-muted hover:text-good-ink hover:bg-surface-hover cursor-pointer"
                          title="Está certo assim — só não mostrar mais"
                          aria-label={`Manter ${card.word}`}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {/* Teto de 40 por grupo, dito em voz alta: lista silenciosamente cortada mente. */}
              {itens.length > 40 && (
                <p className="text-[12px] text-ink-faint mt-2">
                  mostrando 40 de {itens.length} — resolva estas e as próximas aparecem
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
