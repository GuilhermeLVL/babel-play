/**
 * A FICHA DE CONTEÚDO DO JOGAR — a mesma ficha da Biblioteca e dos Cartões (`components/conteudo`), ligada
 * à escolha do app inteiro e montada no cabeçalho do saguão (`fxArrumarJogar()`, `fontes.js:187-191`).
 *
 * Mora num componente à parte para as contagens do catálogo (`GET /api/vocab/conteudo`, poucos KB, com
 * ETag) serem lidas SÓ onde há ficha: o `Play` também é a aba "Jogos" de uma sessão, que não tem seletor
 * e não deve pedir nem conferir nada. O catálogo em si só é baixado quando a ficha é tocada (`lazy`, em
 * `SeletorDeConteudo`).
 */
import type { RefObject } from 'react';

import type { ContagensDeConteudo } from '../../../core/learning/contagensDeConteudo';
import type { Conteudo, FonteDeConteudo } from '../../../lib/conteudo/estado';
import { useContagensDeConteudo } from '../../../lib/conteudo/useContagens';
import { type ControleDoSeletor, SeletorDeConteudo } from '../../conteudo/SeletorDeConteudo';

export default function FichaDoJogar({
  conteudo,
  semVolta,
  nomeNaFicha,
  trilhaDoApp,
  semRede,
  controle,
  aoRevisar,
  aoJogar,
  aoCapturar,
  aoTrazer,
}: {
  /** O conteúdo que a ficha mostra: o escolhido, ou a Trilha de quem ainda só tem a Trilha. */
  conteudo: Conteudo;
  semVolta?: boolean;
  nomeNaFicha?: string;
  trilhaDoApp?: { palavras: number; frases: number } | null;
  semRede?: boolean;
  controle: RefObject<ControleDoSeletor | null>;
  aoRevisar: (fonte: FonteDeConteudo) => void;
  aoJogar: (fonte: FonteDeConteudo) => void;
  aoCapturar: () => void;
  /** Uma fonte acabou de chegar ("Trazer uma fonte"): o saguão relê o baralho. */
  aoTrazer?: () => void;
}) {
  const { contagens, recarregar } = useContagensDeConteudo(conteudo.idioma);
  /* O catálogo só relê as contagens depois de trazer uma fonte: é o sinal de que o baralho mudou. */
  const aoRecarregar = async (): Promise<ContagensDeConteudo | null> => {
    const k = await recarregar();
    aoTrazer?.();
    return k;
  };
  return (
    <SeletorDeConteudo
      conteudo={conteudo}
      contagens={contagens}
      aoRecarregar={aoRecarregar}
      semRede={semRede}
      controle={controle}
      semVolta={semVolta}
      nomeNaFicha={nomeNaFicha}
      trilhaDoApp={trilhaDoApp}
      aoRevisar={aoRevisar}
      aoJogar={aoJogar}
      aoCapturar={aoCapturar}
    />
  );
}
