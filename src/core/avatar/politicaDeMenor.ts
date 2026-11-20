/**
 * POLÍTICA DE MENOR PARA O AVATAR (ECA Digital, LGPD art. 14).
 *
 * O perfil PROTEGIDO é o do servidor (`server/lib/idade.ts`): todo menor de 18 e quem ainda não declarou a data
 * de nascimento (`faixa !== 'adulto'`). O core não lê idade nem rede: recebe `protegido: boolean` (no cliente,
 * `perfilProtegido()` de `src/lib/protecaoDoMenor.ts`). O servidor continua sendo a fonte da decisão de compra.
 */

import type { OrigemDaBase } from './receita';

/** As faixas do servidor (`FaixaEtaria`). `null`/`undefined` = não declarou. */
export type FaixaEtariaDoAvatar = 'menor-12' | '12-15' | '16-17' | 'adulto';

/** Igual ao servidor: só `adulto` declarado é desprotegido; faixa ausente ou desconhecida é protegida. */
export const protegidoPelaFaixa = (faixa: unknown): boolean => faixa !== 'adulto';

export interface PoliticaDeAvatar {
  /** "Traga o seu" (arquivo VRM/GLB da pessoa). */
  podeImportar: boolean;
  /** Galeria de modelos de terceiros (e miniaturas deles). */
  podeVerGaleriaDeTerceiros: boolean;
  /** Compra de item de avatar com dinheiro. */
  podeComprarComDinheiro: boolean;
  /** Origens de base que a pessoa pode usar. */
  origensPermitidas: readonly OrigemDaBase[];
  /** Nenhum dado de avatar sai do aparelho, para qualquer idade. */
  enviaDadosAoServidor: false;
  /** Sinais/soletração aparecem sempre com o rótulo de demonstração, para qualquer idade. */
  rotuloDeDemonstracaoObrigatorio: true;
}

const PROTEGIDO: PoliticaDeAvatar = {
  podeImportar: false,
  podeVerGaleriaDeTerceiros: false,
  podeComprarComDinheiro: false,
  origensPermitidas: ['familia', 'colecao'],
  enviaDadosAoServidor: false,
  rotuloDeDemonstracaoObrigatorio: true,
};

const ADULTO: PoliticaDeAvatar = {
  podeImportar: true,
  podeVerGaleriaDeTerceiros: true,
  podeComprarComDinheiro: true,
  origensPermitidas: ['familia', 'colecao', 'importado'],
  enviaDadosAoServidor: false,
  rotuloDeDemonstracaoObrigatorio: true,
};

/** Só `protegido === false` (booleano exato) libera. Qualquer outra coisa (undefined, null, 0) é protegido. */
export const politicaDeAvatar = (protegido: boolean): PoliticaDeAvatar => (protegido === false ? ADULTO : PROTEGIDO);

export const origemPermitida = (protegido: boolean, origem: unknown): origem is OrigemDaBase =>
  (politicaDeAvatar(protegido).origensPermitidas as readonly unknown[]).includes(origem);
