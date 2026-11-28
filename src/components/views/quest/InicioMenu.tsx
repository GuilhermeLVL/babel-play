import '../../../styles/navegacaoSimples.css';

import {
  BookOpen,
  ChartColumn,
  CreditCard,
  Gamepad2,
  Languages,
  Layers,
  Library,
  Lock,
  Mic,
  Shirt,
  Sparkles,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { porcentagemDe } from '../../../core/livros/meusLivros';
import type { AppMetrics } from '../../../data/api';
import { edicaoEstatica } from '../../../lib/edicaoEstatica';
import { onPlanChange } from '../../../lib/entitlements';
import { numero, t, tp } from '../../../lib/i18n';
import { idNaEstante, recentes, useMeusLivros } from '../../../lib/livros/meusLivros';
import { posicoes } from '../../../lib/livros/posicoesDoAparelho';
import { comNomeDoPlano, planoDeEntradaAgora } from '../../../lib/planoDeEntrada';
import { pedirTela } from '../../../lib/polimento/precarga';
import type { AgeProfileType } from '../../../lib/profile';
import type { DerivedProgress } from '../../../lib/progress';
import { exigeConta } from '../../conta/exigeConta';
import { lerUltimaAoVivo } from '../../shell/EscolhaAoVivo';
import { fraseDoPlano, veConviteDoPremium } from '../../shell/fraseDoPlano';
import { ITEM_AO_VIVO, NAV_ITEMS, navLabel } from '../../shell/navItems';

/**
 * O INÍCIO É O MENU (flag `navegacao_simples`; openspec `navegacao-mais-simples`, opção 3): a grade de destinos que tomou
 * o lugar do trilho. O Ao vivo é o bloco grande e abre DIRETO no último modo usado (Legendar ou Conversar; a troca é dentro
 * da tela); Cartões traz o número do dia, Livros o progresso do livro atual; Progresso, Personalizar e Planos fecham a
 * grade (Planos é "Seja Premium" em destaque para o Grátis, sem conta e teste, e "Seu plano" para quem assina). Os rótulos
 * são os do perfil (`navItems`).
 * Pedaço à parte (desce só com a flag): com ela desligada, ninguém o baixa.
 */
interface Props {
  onChangeView: (view: string, data?: { id?: string; modo?: 'signup' }) => void;
  metrics: AppMetrics | null;
  progress: DerivedProgress;
  semConta: boolean;
  ageProfile: AgeProfileType;
  /** A frase do ladrilho dos cartões (`ladrilhoDosCartoes`, a mesma do Início de sempre). */
  fraseDosCartoes: string;
}

const intencaoDe = (rota: string) => ({
  onPointerDown: () => void pedirTela(rota),
  onFocus: () => void pedirTela(rota, true),
});

const rotulo = (id: string, perfil: AgeProfileType): string => {
  const item = NAV_ITEMS.find((i) => i.id === id);
  return item ? navLabel(item, perfil) : '';
};

/**
 * O LIVRO ATUAL: o aberto mais recentemente neste aparelho, com o progresso que o leitor já guarda (`posicoes`). O título
 * só aparece para o livro que a PESSOA trouxe; o do catálogo passa pelo filtro do perfil na tela de Livros, e aqui fica só
 * o progresso (um título que o perfil não pode mais ver não vaza pelo Início).
 */
function useLivroAtual(): { titulo: string | null; pct: number } | null {
  const lista = useMeusLivros();
  const atual = recentes(
    lista.filter((l) => !!l.abertoEm),
    1,
  )[0];
  if (!atual) return null;
  const pct = porcentagemDe(posicoes.ler(idNaEstante(atual))?.fracao ?? 0);
  return { titulo: atual.origem === 'catalogo' ? null : atual.titulo, pct };
}

export default function InicioMenu({ onChangeView, metrics, progress, semConta, ageProfile, fraseDosCartoes }: Props) {
  const modo = lerUltimaAoVivo();
  const hoje = !semConta && metrics ? metrics.dueToday : 0;
  const livro = useLivroAtual();
  /* O plano muda (assinatura, fim do teste): o bloco Planos acompanha. */
  const [, setVersaoDoPlano] = useState(0);
  useEffect(() => onPlanChange(() => setVersaoDoPlano((v) => v + 1)), []);
  const temPlanos = !edicaoEstatica() && NAV_ITEMS.some((i) => i.id === 'planos');
  const convite = temPlanos && veConviteDoPremium();
  const pedeConta = (id: string) =>
    semConta && exigeConta(id) ? (
      <span className="q-d q-pede-conta">
        <Lock aria-hidden /> {edicaoEstatica() ? t('Na versão completa') : t('Pede conta')}
      </span>
    ) : null;

  return (
    <nav aria-label={t('Navegação principal')} data-testid="inicio-menu">
      <div className="ns-blocos">
        <button
          type="button"
          className="q-tile pri ns-grande"
          onClick={() => onChangeView(modo)}
          {...intencaoDe(modo)}
          data-testid="bloco-ao-vivo"
          data-modo={modo}
        >
          <span className="q-ic">{modo === 'interprete' ? <Languages aria-hidden /> : <Mic aria-hidden />}</span>
          <b>{navLabel(ITEM_AO_VIVO, ageProfile)}</b>
          <span className="q-d">{t('Vídeo, jogo, aula ou conversa, com tradução ao vivo.')}</span>
          <span className="q-chip" aria-hidden="true">
            {modo === 'interprete' ? <Languages aria-hidden /> : <Mic aria-hidden />}
            {modo === 'interprete' ? t('Conversar') : t('Legendar agora')}
          </span>
        </button>

        <button
          type="button"
          className="q-tile"
          onClick={() => onChangeView('cartoes')}
          {...intencaoDe('cartoes')}
          data-testid="bloco-cartoes"
          aria-label={
            hoje > 0
              ? rotulo('cartoes', ageProfile) + ', ' + tp(hoje, '{n} cartão para hoje', '{n} cartões para hoje')
              : undefined
          }
        >
          <span className="q-ic">
            <Layers aria-hidden />
          </span>
          {hoje > 0 && (
            <span className="ns-num" aria-hidden="true">
              {hoje > 999 ? '999+' : numero(hoje)}
            </span>
          )}
          <b>{rotulo('cartoes', ageProfile)}</b>
          <span className="q-d">{fraseDosCartoes}</span>
        </button>

        <button
          type="button"
          className="q-tile"
          onClick={() => onChangeView('play')}
          {...intencaoDe('play')}
          data-testid="bloco-jogar"
        >
          <span className="q-ic">
            <Gamepad2 aria-hidden />
          </span>
          <b>{rotulo('play', ageProfile)}</b>
          <span className="q-d">{t('Jogos com as palavras das suas sessões.')}</span>
        </button>

        <button
          type="button"
          className="q-tile"
          onClick={() => onChangeView('livros')}
          {...intencaoDe('livros')}
          data-testid="bloco-livros"
        >
          <span className="q-ic">
            <BookOpen aria-hidden />
          </span>
          <b>{rotulo('livros', ageProfile)}</b>
          {livro ? (
            <>
              <span className="q-d">
                {livro.titulo ? `${livro.titulo} · ` : ''}
                {t('{pct}% lido', { pct: livro.pct })}
              </span>
              <span
                className="q-barra"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={livro.pct}
                aria-label={t('{pct}% lido', { pct: livro.pct })}
              >
                <span style={{ width: `${livro.pct}%` }} />
              </span>
            </>
          ) : (
            <span className="q-d">{t('Clássicos em domínio público para ler no seu nível, ou um livro seu.')}</span>
          )}
        </button>

        <button
          type="button"
          className="q-tile"
          onClick={() => onChangeView('library')}
          {...intencaoDe('library')}
          data-testid="bloco-biblioteca"
        >
          <span className="q-ic">
            <Library aria-hidden />
          </span>
          <b>{rotulo('library', ageProfile)}</b>
          {pedeConta('library') ?? <span className="q-d">{t('Suas gravações, vídeos e documentos.')}</span>}
        </button>

        <button
          type="button"
          className="q-tile"
          onClick={() => onChangeView('estatisticas')}
          {...intencaoDe('estatisticas')}
          data-testid="bloco-progresso"
        >
          <span className="q-ic">
            <ChartColumn aria-hidden />
          </span>
          <b>{rotulo('estatisticas', ageProfile)}</b>
          {pedeConta('estatisticas') ??
            (progress.available ? (
              <span className="q-d">
                {t('Nível {nivel}', { nivel: progress.level })} · {numero(progress.xp)} XP
              </span>
            ) : null)}
        </button>

        <button
          type="button"
          className="q-tile"
          onClick={() => onChangeView('loja')}
          {...intencaoDe('loja')}
          data-testid="bloco-personalizar"
        >
          <span className="q-ic">
            <Shirt aria-hidden />
          </span>
          <b>{rotulo('loja', ageProfile)}</b>
          {pedeConta('loja') ?? <span className="q-d">{t('Seu visual, a loja e as conquistas.')}</span>}
        </button>

        {/* PLANOS PARA TODOS (pedido do dono, 28/11/2026): quem não assina vê o convite em destaque; quem assina, o plano. Não
            existe no site sem servidor (não há plano a assinar). */}
        {temPlanos && (
          <button
            type="button"
            className={convite ? 'q-tile ns-planos ns-premium' : 'q-tile ns-planos'}
            onClick={() => onChangeView('planos')}
            {...intencaoDe('planos')}
            data-testid="bloco-planos"
            data-convite={convite ? 'true' : undefined}
          >
            <span className="q-ic">{convite ? <Sparkles aria-hidden /> : <CreditCard aria-hidden />}</span>
            <b>{convite ? comNomeDoPlano(t('Seja Premium'), planoDeEntradaAgora()) : t('Seu plano')}</b>
            <span className="q-d">{fraseDoPlano()}</span>
          </button>
        )}
      </div>
    </nav>
  );
}
