import { useEffect, useReducer, useSyncExternalStore } from 'react';

import {
  type EspacoDeAnuncio as Espaco,
  FLAG_ANUNCIOS,
  type FormatoDeAnuncio,
  podeMostrar,
} from '../../core/anuncios/politicaDeAnuncio';
import { montarPedidoDeAnuncio } from '../../lib/anuncios/pedido';
import { assinarProvedorDeAnuncios, type ProvedorDeAnuncios, provedorDeAnuncios } from '../../lib/anuncios/provedor';
import { onPlanChange } from '../../lib/entitlements';
import { useFlag } from '../../lib/flags';
import { usePreferencias } from '../../lib/preferencias';
import { aoMudarProtecao } from '../../lib/protecaoDoMenor';
import { navegarPara } from '../../lib/rotas';
import { ligarDemonstracaoDeAnuncios } from './demonstracao/ligar';

/**
 * UM ESPAÇO DE ANÚNCIO (change `planos-v3-e-rota-inteligente`, spec `anuncios-no-gratis`) — o ÚNICO
 * componente por onde um anúncio pode entrar numa tela.
 *
 * Ele recebe o espaço e o formato, e faz duas perguntas:
 *   1. QUEM desenha? O provedor registrado (`lib/anuncios/provedor.ts`). NÃO EXISTE provedor de produção
 *      nesta etapa: sem provedor este componente não renderiza NADA, não monta nenhum outro gancho e não
 *      faz nenhum pedido de rede. É o estado de fábrica, e a tela fica idêntica à de antes.
 *   2. PODE? A política pura (`core/anuncios/politicaDeAnuncio.ts`), com o estado de agora
 *      (`lib/anuncios/pedido.ts`). Negou, não renderiza nada.
 *
 * Só com as duas respostas o provedor desenha. O espaço volta a perguntar quando muda o que a política
 * lê: a flag, o plano, o perfil, o consentimento, a rede e o fim de uma rodada.
 *
 * A DEMONSTRAÇÃO (só em desenvolvimento): com `localStorage['babel.px.anunciosDeProva'] = '1'` o
 * provedor de demonstração é carregado e desenha "Patrocinado · exemplo" nos lugares do protótipo.
 * Ver `lib/anuncios/pedido.ts` e `demonstracao/ligar.ts`.
 */
interface EspacoDeAnuncioProps {
  espaco: Espaco;
  formato: FormatoDeAnuncio;
  /** A porta "Sem anúncios" de todo anúncio. Ausente, leva à tela de Planos. */
  aoSemAnuncios?: () => void;
}

const irAosPlanos = () => navegarPara({ view: 'planos' });
const semProvedor = () => null;

export default function EspacoDeAnuncio(props: EspacoDeAnuncioProps) {
  const provedor = useSyncExternalStore(assinarProvedorDeAnuncios, provedorDeAnuncios, semProvedor);
  /* Só em desenvolvimento, e só com a chave: fora disso a função é vazia e não carrega nada. */
  useEffect(() => {
    void ligarDemonstracaoDeAnuncios();
  }, []);
  if (!provedor) return null;
  return <EspacoComProvedor provedor={provedor} {...props} />;
}

function EspacoComProvedor({
  provedor,
  espaco,
  formato,
  aoSemAnuncios = irAosPlanos,
}: EspacoDeAnuncioProps & { provedor: ProvedorDeAnuncios }) {
  /* A flag e o consentimento são lidos por `montarPedidoDeAnuncio`; os dois ganchos só fazem o espaço
     perguntar de novo quando eles mudam. */
  useFlag(FLAG_ANUNCIOS);
  usePreferencias();
  const [, reavaliar] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const semPlano = onPlanChange(reavaliar);
    const semProtecao = aoMudarProtecao(reavaliar);
    /* A tela de fim nasce com a rodada ainda marcada como ativa (`Play.tsx` tira a marca num efeito e
       avisa por este evento): é aqui que o espaço do fim de rodada passa a poder. */
    window.addEventListener('babel:rodada-fechou', reavaliar);
    /* Sem rede não há anúncio (a política nega): caiu ou voltou, o espaço pergunta de novo. */
    window.addEventListener('online', reavaliar);
    window.addEventListener('offline', reavaliar);
    return () => {
      window.removeEventListener('online', reavaliar);
      window.removeEventListener('offline', reavaliar);
      semPlano();
      semProtecao();
      window.removeEventListener('babel:rodada-fechou', reavaliar);
    };
  }, []);

  if (!podeMostrar(montarPedidoDeAnuncio(espaco, formato)).pode) return null;
  const Desenho = provedor.Espaco;
  return <Desenho espaco={espaco} formato={formato} aoSemAnuncios={aoSemAnuncios} />;
}
