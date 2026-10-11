/**
 * AS FONTES DO CATÁLOGO, PRONTAS PARA DESENHAR — os nomes, os ícones e as linhas de texto que a ficha e
 * o catálogo compartilham. Porte das leituras de `seletor.js:20-33` e de `fontes.js:67-112`, sobre as
 * contagens de verdade (`GET /api/vocab/conteudo`).
 */
import {
  BookOpen,
  GraduationCap,
  Layers,
  type LucideIcon,
  Mic,
  Monitor,
  TriangleAlert,
  WalletCards,
} from 'lucide-react';

import type { ContagemDaFonte, ContagensDeConteudo, FonteContada } from '../../core/learning/contagensDeConteudo';
import { type Conteudo, type FonteDeConteudo, TUDO } from '../../lib/conteudo/estado';
import { numero, t, tp } from '../../lib/i18n';
import { langLabelNaUI } from '../../lib/languages';

/** Os grupos e a ordem do catálogo (`FX_GRUPOS`, `fontes.js:51-55`). */
export type GrupoDoCatalogo = 'topo' | 'sessao' | 'anki' | 'trilha';

export interface LinhaDoCatalogo extends ContagemDaFonte {
  chave: string;
  fonte: FonteDeConteudo;
  grupo: GrupoDoCatalogo;
  /** O nome inteiro, como aparece na lista (`fsNomeNaLista`, `seletor.js:31`). */
  nome: string;
  /** A etiqueta do painel: "Sessão de áudio", "Anki" (`tipo` em `CT_BARALHOS`, `cartoes.js:80-92`). */
  tipo: string;
  /** De onde veio (`fsDeOnde`, `seletor.js:32-33`). */
  deOnde: string;
  Icone: LucideIcon;
}

/** "Inglês": o idioma no idioma da interface, com a inicial maiúscula (`FX_LING`, `fontes.js:46`). */
export function nomeDoIdioma(codigo: string): string {
  const nome = langLabelNaUI(codigo);
  return nome.charAt(0).toLocaleUpperCase() + nome.slice(1);
}

/** Os ícones de `CT_BARALHOS` (`cartoes.js:80-92`): camadas, alerta, microfone, monitor, livro, carteira, capelo. */
export function iconeDaFonte(f: FonteDeConteudo, tipoDaSessao?: string | null): LucideIcon {
  if (f.tipo === 'dificeis') return TriangleAlert;
  if (f.tipo === 'anki') return WalletCards;
  if (f.tipo === 'trilha') return GraduationCap;
  if (f.tipo === 'sessao') return tipoDaSessao === 'video' ? Monitor : tipoDaSessao === 'document' ? BookOpen : Mic;
  return Layers;
}

/** O nome curto, o da ficha (`fsNome`, `seletor.js:29`). */
export function nomeCurtoDaFonte(f: FonteDeConteudo): string {
  if (f.tipo === 'dificeis') return t('Difíceis');
  if (f.tipo === 'trilha') return t('Trilha');
  if (f.tipo === 'sessao') return f.nome || t('Sessão');
  if (f.tipo === 'anki') return f.nome || t('Baralho do Anki');
  return t('Tudo');
}

/** "37 palavras · 31 frases", por extenso (`fxContagem`, `fontes.js:109-112`). */
export function contagemPorExtenso(m: { palavras: number; frases: number }): string {
  const palavras = tp(m.palavras, '{n} palavra', '{n} palavras', { n: numero(m.palavras) });
  const frases = m.frases ? tp(m.frases, '{n} frase', '{n} frases', { n: numero(m.frases) }) : t('sem frases');
  return `${palavras} · ${frases}`;
}

/** "3 out": o dia e o mês curto. */
function diaEMes(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' }).replace('.', '')}`;
}

function deOndeDaSessao(s: FonteContada): string {
  const minutos = s.duracaoMs ? Math.max(1, Math.round(s.duracaoMs / 60_000)) : 0;
  const meio = minutos ? t('{n} min', { n: minutos }) : s.tipo === 'document' ? t('texto') : '';
  return [diaEMes(s.quando), meio].filter(Boolean).join(' · ');
}

const tipoDaSessao = (tipo: string | null) =>
  tipo === 'video' ? t('Sessão de vídeo') : tipo === 'document' ? t('Texto') : t('Sessão de áudio');

/** Há dois idiomas ou mais? Então o idioma é o primeiro nível (`fsLinguas`, `seletor.js:21`). */
export const doisIdiomas = (k: ContagensDeConteudo | null) => (k?.idiomas.length ?? 0) > 1;

/**
 * As linhas do catálogo, na ordem do protótipo: Tudo e Difíceis; as sessões; os baralhos do Anki; a
 * Trilha (`fxListaDoCatalogo`, `seletor.js:211-226`). "Difíceis" só entra quando há alguma (ou quando é
 * a escolha): uma linha de zero palavras não serve a jogo nem a revisão.
 */
export function linhasDoCatalogo(
  k: ContagensDeConteudo,
  emUso: FonteDeConteudo,
  /** A Trilha do app no idioma (o Jogar a joga inteira): a linha existe mesmo sem palavra ativada. */
  trilhaDoApp?: { palavras: number; frases: number } | null,
): LinhaDoCatalogo[] {
  const dois = doisIdiomas(k);
  const origens = [
    k.sessoes.length ? tp(k.sessoes.length, '{n} sessão', '{n} sessões') : '',
    k.trilha ? t('a Trilha') : '',
    k.anki.length ? tp(k.anki.length, '{n} baralho do Anki', '{n} baralhos do Anki') : '',
  ].filter(Boolean);
  const linhas: LinhaDoCatalogo[] = [
    {
      chave: 'tudo',
      fonte: TUDO,
      grupo: 'topo',
      nome: dois ? t('Tudo em {idioma}', { idioma: nomeDoIdioma(k.idioma).toLocaleLowerCase() }) : t('Tudo'),
      tipo: t('Automático'),
      deOnde: dois && origens.length ? origens.join(', ') : t('Todas as origens'),
      Icone: Layers,
      ...k.tudo,
    },
  ];
  if (k.dificeis.palavras > 0 || emUso.tipo === 'dificeis')
    linhas.push({
      chave: 'dificeis',
      fonte: { tipo: 'dificeis' },
      grupo: 'topo',
      nome: t('Difíceis'),
      tipo: t('Automático'),
      deOnde: t('As que você mais erra, de todo o conteúdo'),
      Icone: TriangleAlert,
      ...k.dificeis,
    });
  for (const s of k.sessoes) {
    const fonte: FonteDeConteudo = { tipo: 'sessao', id: s.id, nome: s.nome };
    linhas.push({
      chave: `sessao:${s.id}`,
      fonte,
      grupo: 'sessao',
      nome: s.nome || t('Sessão'),
      tipo: tipoDaSessao(s.tipo),
      deOnde: deOndeDaSessao(s),
      Icone: iconeDaFonte(fonte, s.tipo),
      palavras: s.palavras,
      frases: s.frases,
      paraHoje: s.paraHoje,
    });
  }
  for (const b of k.anki)
    linhas.push({
      chave: `anki:${b.id}`,
      fonte: { tipo: 'anki', id: b.id, nome: b.nome },
      grupo: 'anki',
      nome: b.nome || t('Baralho do Anki'),
      tipo: t('Anki'),
      deOnde: b.quando ? t('trazido em {data}', { data: diaEMes(b.quando) }) : '',
      Icone: WalletCards,
      palavras: b.palavras,
      frases: b.frases,
      paraHoje: b.paraHoje,
    });
  if (k.trilha || trilhaDoApp)
    linhas.push({
      chave: 'trilha',
      fonte: { tipo: 'trilha' },
      grupo: 'trilha',
      nome: t('Trilha de vocabulário'),
      tipo: t('Trilha'),
      deOnde: k.trilha
        ? tp(k.trilha.palavras, '{n} palavra ativada', '{n} palavras ativadas', { n: numero(k.trilha.palavras) })
        : t('Palavras prontas do app, por nível'),
      Icone: GraduationCap,
      palavras: trilhaDoApp?.palavras ?? k.trilha?.palavras ?? 0,
      frases: trilhaDoApp?.frases ?? k.trilha?.frases ?? 0,
      paraHoje: k.trilha?.paraHoje ?? 0,
    });
  return linhas;
}

/** O idioma que a ficha mostra ao lado do nome: só com dois idiomas e fonte sem idioma próprio (`fsLingua`, `seletor.js:30`). */
export function idiomaNaFicha(c: Conteudo, k: ContagensDeConteudo | null): string {
  if (!doisIdiomas(k) || !c.idioma) return '';
  return c.fonte.tipo === 'sessao' || c.fonte.tipo === 'anki' ? '' : nomeDoIdioma(c.idioma);
}
