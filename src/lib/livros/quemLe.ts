/**
 * QUEM LÊ: o teto de classificação etária do catálogo para esta pessoa. Vem do perfil que já existe; nada de
 * pedir dado novo (spec de Livros & Leitura, Design §2).
 *
 *   · adulto declarado (ou o self-host, onde o dono da máquina é o leitor): vê tudo, inclusive "a revisar";
 *   · 16–17 anos: até 16; 12–15: até 12; menos de 12: só livre;
 *   · perfil protegido sem faixa conhecida (sem conta, idade não declarada): até 12, que é o público mínimo
 *     do app (ECA Digital);
 *   · o perfil de exibição "Infantil" (`kids`) baixa o teto para livre, qualquer que seja a conta: quem
 *     configurou o app para uma criança não quer romance de adulto na vitrine.
 */
import type { TetoDeClassificacao } from '../../core/livros/catalogo';
import type { AgeProfileType } from '../profile';
import { estadoDaProtecao, perfilProtegido } from '../protecaoDoMenor';

export function tetoDoLeitor(perfilDeExibicao: AgeProfileType): TetoDeClassificacao {
  if (perfilDeExibicao === 'kids') return 'livre';
  const faixa = estadoDaProtecao()?.faixa ?? null;
  if (faixa === 'menor-12') return 'livre';
  if (faixa === '12-15') return '12';
  if (faixa === '16-17') return '16';
  if (faixa === 'adulto') return '18';
  return perfilProtegido() ? '12' : '18';
}

/** O leitor é menor (ou de idade desconhecida)? É o que esconde qualquer convite a plano. */
export const leitorMenor = (teto: TetoDeClassificacao) => teto !== '18';
