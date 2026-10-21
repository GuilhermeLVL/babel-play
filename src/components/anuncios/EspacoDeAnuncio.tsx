import { useEffect, useReducer, useState, useSyncExternalStore } from 'react';

import {
  type EspacoDeAnuncio as Espaco,
  FLAG_ANUNCIOS,
  type FormatoDeAnuncio,
  podeMostrar,
} from '../../core/anuncios/politicaDeAnuncio';
import { concluirPremiado, type PremiadoConcluido } from '../../data/rotas/anuncios';
import { ligarProvedorDeAnuncios } from '../../lib/anuncios/ligar';
import { montarPedidoDeAnuncio } from '../../lib/anuncios/pedido';
import { assinarProvedorDeAnuncios, type ProvedorDeAnuncios, provedorDeAnuncios } from '../../lib/anuncios/provedor';
import { onPlanChange } from '../../lib/entitlements';
import { useFlag } from '../../lib/flags';
import { flagLigada } from '../../lib/flagsCache';
import { lerPreferencias, usePreferencias } from '../../lib/preferencias';
import { aoMudarProtecao } from '../../lib/protecaoDoMenor';
import { navegarPara } from '../../lib/rotas';
import ConsentimentoDeAnuncios from './ConsentimentoDeAnuncios';
import { ligarDemonstracaoDeAnuncios } from './demonstracao/ligar';

/**
 * UM ESPAÇO DE ANÚNCIO (change `planos-v3-e-rota-inteligente`, spec `anuncios-no-gratis`) — o ÚNICO
 * componente por onde um anúncio pode entrar numa tela.
 *
 * Ele recebe o espaço e o formato, e faz duas perguntas:
 *   1. QUEM desenha? O provedor registrado (`lib/anuncios/provedor.ts`). O real (um quadro para a origem
 *      de anúncios, ruling R32) só é registrado num build com `VITE_ANUNCIOS_ORIGEM` (`lib/anuncios/ligar.ts`).
 *      Sem provedor (ou com um que este navegador não consegue usar) este componente não renderiza NADA,
 *      não monta nenhum outro gancho e não faz nenhum pedido de rede. É o estado de fábrica.
 *   2. PODE? A política pura (`core/anuncios/politicaDeAnuncio.ts`), com o estado de agora
 *      (`lib/anuncios/pedido.ts`). Negou, não renderiza nada.
 *
 * Só com as duas respostas o provedor desenha. Uma exceção, só do provedor REAL (`pedeConsentimento`):
 * quando a política nega SÓ por falta do consentimento e a pessoa nunca respondeu, o primeiro espaço
 * elegível mostra a folha de consentimento (`ConsentimentoDeAnuncios`) no lugar do anúncio — um espaço
 * por vez, e nunca para o perfil protegido (a política nega antes).
 * O espaço volta a perguntar quando muda o que a política
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

/** O evento que `lib/flags.ts` dispara quando as flags mudam. */
const EVENTO_DAS_FLAGS = 'babel_flags_changed';
const irAosPlanos = () => navegarPara({ view: 'planos' });
const semProvedor = () => null;

/**
 * O fim de um premiado: o servidor credita (`concluirPremiado`) e o que ele creditou volta ao provedor; a recusa
 * rejeita com o `code` dele.
 */
async function recompensar(exibicaoId: string): Promise<PremiadoConcluido> {
  const r = await concluirPremiado(exibicaoId);
  if (r.ok === false) throw new Error(r.code ?? r.error);
  const { ok: _ok, ...concluido } = r;
  return concluido;
}

export default function EspacoDeAnuncio(props: EspacoDeAnuncioProps) {
  const provedor = useSyncExternalStore(assinarProvedorDeAnuncios, provedorDeAnuncios, semProvedor);
  /* O real só é pedido com a flag `anuncios` LIGADA (desligada, nem o módulo nem o CSS dele são baixados) e num
     build com a origem de anúncios. A flag é lida do CACHE (`flagsCache`, sem pedir à rede: o estado de fábrica
     não pode pedir nada a mais) e de novo quando as flags mudam. A demonstração, só em desenvolvimento. */
  useEffect(() => {
    const tentar = () => {
      void (flagLigada(FLAG_ANUNCIOS) ? ligarProvedorDeAnuncios() : Promise.resolve(false)).then((ligou) => {
        if (!ligou) void ligarDemonstracaoDeAnuncios();
      });
    };
    tentar();
    window.addEventListener(EVENTO_DAS_FLAGS, tentar);
    return () => window.removeEventListener(EVENTO_DAS_FLAGS, tentar);
  }, []);
  if (!provedor || provedor.disponivel?.() === false) return null;
  return <EspacoComProvedor provedor={provedor} {...props} />;
}

/* O convite ao consentimento aparece em UM espaço por vez: o primeiro que o pede fica com ele. */
let conviteCom: symbol | null = null;

/** A pessoa já respondeu (sim ou "agora não") ao consentimento de anúncios? */
function jaRespondeu(): boolean {
  return (lerPreferencias().registroDeConsentimentos ?? []).some((r) => r.chave === 'anuncios');
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
    /* A folha de consentimento respondeu (aqui ou em Ajustes). */
    window.addEventListener('babel:consentimento-anuncios', reavaliar);
    /* Sem rede não há anúncio (a política nega): caiu ou voltou, o espaço pergunta de novo. */
    window.addEventListener('online', reavaliar);
    window.addEventListener('offline', reavaliar);
    return () => {
      window.removeEventListener('online', reavaliar);
      window.removeEventListener('offline', reavaliar);
      semPlano();
      semProtecao();
      window.removeEventListener('babel:rodada-fechou', reavaliar);
      window.removeEventListener('babel:consentimento-anuncios', reavaliar);
    };
  }, []);

  const decisao = podeMostrar(montarPedidoDeAnuncio(espaco, formato));
  const querConvite = !!provedor.pedeConsentimento && decisao.motivo === 'sem_consentimento' && !jaRespondeu();
  const convidando = useConvite(querConvite);
  if (!decisao.pode) {
    return convidando ? <ConsentimentoDeAnuncios /> : null;
  }
  const Desenho = provedor.Espaco;
  return (
    <Desenho
      espaco={espaco}
      formato={formato}
      aoSemAnuncios={aoSemAnuncios}
      aoRecompensar={formato === 'premiado' ? recompensar : undefined}
    />
  );
}

/** Fica com o convite se ele estiver livre; solta ao deixar de querer ou ao desmontar. */
function useConvite(quer: boolean): boolean {
  const [eu] = useState(() => Symbol('convite'));
  const [tenho, setTenho] = useState(false);
  useEffect(() => {
    if (!quer) return;
    if (conviteCom !== null && conviteCom !== eu) return;
    conviteCom = eu;
    setTenho(true);
    return () => {
      if (conviteCom === eu) conviteCom = null;
      setTenho(false);
    };
  }, [quer, eu]);
  return quer && tenho;
}
