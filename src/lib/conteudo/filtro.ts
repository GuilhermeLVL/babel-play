/**
 * A TRADUÇÃO DE MÃO DUPLA entre o conteúdo escolhido e o filtro guardado do Jogar
 * (`core/minigames/filtro.ts`, persistido por `lib/filtroDaPratica.ts` e espelhado em `/jogar?…`).
 *
 * Existe para NÃO haver um terceiro estado: o Jogar continua falando `FiltroDaPratica`, e o seletor é
 * quem escreve nele. A etapa seguinte só liga: ao escolher, `gravarFiltro(filtroDoConteudo(c))` e
 * `publicarQueryDoJogar(queryDoFiltro(...))`; ao abrir o Jogar por um link, `conteudoDoFiltro(...)`.
 *
 *   Tudo      ⇄ o filtro padrão (acervo geral + sessões, sem recorte)
 *   Difíceis  ⇄ baralho + recorte `dificeis`
 *   sessão    ⇄ fonte `sessao` com UMA sessão
 *   Anki      ⇄ fonte `baralho` com UM baralho
 *   Trilha    ⇄ fonte `trilha`
 * O idioma é `idiomas[0]`. A ida e a volta dão a mesma escolha nas cinco.
 */
import type { FiltroDaPratica } from '@core';
import { FILTRO_PADRAO } from '@core';

import { type Conteudo, type FonteDeConteudo, TUDO } from './estado';

export function filtroDoConteudo(c: Conteudo): FiltroDaPratica {
  const idiomas = c.idioma ? [c.idioma] : [];
  const f = c.fonte;
  if (f.tipo === 'dificeis') return { ...FILTRO_PADRAO, fontes: ['baralho'], idiomas, recorte: { dificeis: true } };
  if (f.tipo === 'sessao') return { ...FILTRO_PADRAO, fontes: ['sessao'], sessoes: [f.id], idiomas };
  if (f.tipo === 'anki') return { ...FILTRO_PADRAO, fontes: ['baralho'], baralhos: [f.id], idiomas };
  if (f.tipo === 'trilha') return { ...FILTRO_PADRAO, fontes: ['trilha'], idiomas };
  return { ...FILTRO_PADRAO, idiomas };
}

/** Os nomes que a volta não tem como saber (o filtro só guarda ids): quem chama os fornece. */
export interface NomesDasFontes {
  sessao?: (id: string) => string | undefined;
  anki?: (id: string) => string | undefined;
}

/**
 * A volta. `exato` é falso quando o filtro tem algo que o seletor não representa (duas sessões,
 * recorte por nível, "nunca vistas", mídia): a escolha devolvida é a mais próxima, e quem chama decide
 * se a adota (um link antigo) ou se deixa o filtro como está.
 */
export function conteudoDoFiltro(
  f: FiltroDaPratica,
  nomes: NomesDasFontes = {},
): { conteudo: Conteudo; exato: boolean } {
  const idioma = (f.idiomas[0] ?? '').toLowerCase().split('-')[0];
  const r = f.recorte ?? {};
  const m = f.midia ?? {};
  const outrosRecortes = !!(r.nuncaVistas || r.pedindoRevisao || r.niveis?.length || m.comTraducao || m.comFrase);
  const so = (x: 'baralho' | 'sessao' | 'trilha') => f.fontes.length === 1 && f.fontes[0] === x;
  let fonte: FonteDeConteudo = TUDO;
  let exato = !outrosRecortes && f.idiomas.length <= 1;

  if (r.dificeis) {
    fonte = { tipo: 'dificeis' };
    exato &&= so('baralho') && !f.baralhos.length;
  } else if (so('trilha')) {
    fonte = { tipo: 'trilha' };
    /* O nível da Trilha fica no filtro (`nivelTrilha`): o seletor não o escolhe. */
    exato &&= !f.nivelTrilha;
  } else if (so('sessao') && f.sessoes.length >= 1) {
    fonte = { tipo: 'sessao', id: f.sessoes[0], nome: nomes.sessao?.(f.sessoes[0]) ?? '' };
    exato &&= f.sessoes.length === 1;
  } else if (so('baralho') && f.baralhos.length >= 1) {
    fonte = { tipo: 'anki', id: f.baralhos[0], nome: nomes.anki?.(f.baralhos[0]) ?? '' };
    exato &&= f.baralhos.length === 1;
  } else {
    const padrao = f.fontes.length === 2 && f.fontes.includes('baralho') && f.fontes.includes('sessao');
    exato &&= padrao && !f.sessoes.length && !f.baralhos.length;
  }
  return { conteudo: { idioma, fonte }, exato };
}
