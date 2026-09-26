import { Cloud, CloudOff, Gauge, type LucideIcon, Sparkles, Trophy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlanoDaFlag } from '../../core/flags';
import {
  type ComponenteDeOferta,
  type MomentoDeOferta,
  OFERTAS_PADRAO,
  type PlanoSugerido,
  resolverTextoRemoto,
} from '../../core/ofertas';
import { precoDoPlano } from '../../core/planos';
import { onPlanChange } from '../../lib/entitlements';
import { ehConfigDeOfertas, useConfigRemota, useFlag } from '../../lib/flags';
import { estadoDeIdentidade } from '../../lib/identidade';
import { verificarCota } from '../../lib/ofertas/cota';
import { pedirDestaqueEmPlanos } from '../../lib/ofertas/destaque';
import { type DetalheDaOferta, dispararOferta, ehMomento, EVENTO_OFERTA } from '../../lib/ofertas/eventos';
import {
  iniciarSessaoDeUso,
  lerHistorico,
  lerSessao,
  registrarDispensa,
  registrarExibicao,
  registrarNaoMostrar,
} from '../../lib/ofertas/historico';
import {
  lembrarAtribuicao,
  registrarEventoDeOferta,
  type RotulosDaOferta,
  rotulosDaOferta,
} from '../../lib/ofertas/instrumentacao';
import { decidirOferta, type DecisaoDeOferta, type EstadoDaTela } from '../../lib/ofertas/motor';
import { planoDaOferta } from '../../lib/ofertas/plano';
import { capturaAtiva } from '../../lib/sessaoDeCaptura';
import { useI18n } from '../../lib/useI18n';
import CartaoDeOferta from './CartaoDeOferta';
import ModalDeOferta from './ModalDeOferta';

/**
 * O HOST DAS OFERTAS (Fase 8) — montado UMA vez, no `App`. É o único lugar que desenha oferta.
 *
 * O QUE ELE FAZ:
 *   1. escuta `babel:oferta` (o canal de `lib/ofertas/eventos.ts` — os adaptadores de nuvem, o
 *      iChat, o fim de rodada, a celebração de conquista e o convidado da Fase 7 disparam ali);
 *   2. pergunta ao MOTOR puro (`lib/ofertas/motor.ts`) se aparece, com a flag `oferta_planos`, o
 *      plano, o histórico do aparelho, a sessão de uso e o estado da tela;
 *   3. desenha UM componente por vez: banner/aviso de cota (`CartaoDeOferta`), modal
 *      (`ModalDeOferta`) ou comparação — que não é uma tela nova: o CTA abre `views/Planos.tsx`
 *      com o plano sugerido destacado (`lib/ofertas/destaque.ts`);
 *   4. conta tudo (`lib/ofertas/instrumentacao.ts`) e grava a frequência (`lib/ofertas/historico.ts`).
 *
 * TELA OCUPADA: o motor devolve `adiar` durante captura, rodada ou diálogo aberto. O host guarda
 * o ÚLTIMO pedido adiado (10 min de validade) e pergunta de novo a cada 5 s e quando a rodada
 * fecha. Nada aparece por cima de estudo.
 *
 * COTA PRÓXIMA: com conta, pergunta `GET /api/me/uso` (cache de 1 h) ao montar, quando o plano muda
 * e a cada hora; ≥ 80% dispara `cota_proxima`, 100% dispara `fim_de_cota`.
 */

const ICONE: Record<MomentoDeOferta, LucideIcon> = {
  fim_de_cota: Gauge,
  cota_proxima: Gauge,
  modelo_premium: Cloud,
  conquista: Trophy,
  fim_de_sessao: Sparkles,
  convidado_para_conta: CloudOff,
};

const VALIDADE_DO_ADIADO_MS = 10 * 60_000;
const INTERVALO_DE_NOVA_TENTATIVA_MS = 5_000;
const INTERVALO_DA_COTA_MS = 60 * 60_000;

/** O que a tela está fazendo agora — lido do DOM e do módulo da captura, na hora de decidir. */
export function estadoDaTela(): EstadoDaTela {
  const temDocumento = typeof document !== 'undefined';
  return {
    capturaAtiva: capturaAtiva(),
    jogoAtivo: temDocumento && document.body.hasAttribute('data-jogo-ativo'),
    dialogoAberto: temDocumento && !!document.querySelector('dialog[open]'),
  };
}

interface OfertaNaTela {
  momento: MomentoDeOferta;
  decisao: Extract<DecisaoDeOferta, { mostrar: true }>;
  plano: PlanoDaFlag;
  rotulos: RotulosDaOferta;
}

export default function HostDeOfertas({ aoEntrar, aoVerPlanos }: { aoEntrar: () => void; aoVerPlanos: () => void }) {
  const { t, idioma } = useI18n();
  const flagLigada = useFlag('oferta_planos');
  const config = useConfigRemota('oferta_planos', OFERTAS_PADRAO, ehConfigDeOfertas);
  const [atual, setAtual] = useState<OfertaNaTela | null>(null);

  /* Refs: o ouvinte do evento é registrado uma vez e precisa ler o valor MAIS recente. */
  const flagRef = useRef(flagLigada);
  flagRef.current = flagLigada;
  const configRef = useRef(config);
  configRef.current = config;
  const atualRef = useRef(atual);
  atualRef.current = atual;
  const adiado = useRef<{ momento: MomentoDeOferta; ate: number } | null>(null);

  useEffect(() => {
    iniciarSessaoDeUso();
  }, []);

  const avaliar = useCallback((momento: MomentoDeOferta) => {
    if (atualRef.current) return; // uma oferta por vez
    const plano = planoDaOferta();
    const agora = Date.now();
    const decisao = decidirOferta({
      momento,
      flagLigada: flagRef.current,
      config: configRef.current,
      plano,
      historico: lerHistorico(),
      sessao: lerSessao(agora),
      tela: estadoDaTela(),
      agora,
    });
    if (decisao.mostrar === false) {
      if (decisao.adiar) adiado.current = { momento, ate: agora + VALIDADE_DO_ADIADO_MS };
      return;
    }
    if (adiado.current?.momento === momento) adiado.current = null;
    const rotulos = rotulosDaOferta({
      gatilho: decisao.gatilho.id,
      componente: decisao.componente,
      planoAtual: plano,
      planoSugerido: decisao.planoSugerido,
      variante: decisao.variante,
    });
    registrarExibicao(decisao.gatilho.id, !decisao.funcional, agora);
    registrarEventoDeOferta('oferta_exibida', rotulos);
    setAtual({ momento, decisao, plano, rotulos });
  }, []);

  // 1. O canal.
  useEffect(() => {
    const ouvir = (ev: Event) => {
      const d = (ev as CustomEvent<DetalheDaOferta>).detail;
      if (d && ehMomento(d.momento)) avaliar(d.momento);
    };
    window.addEventListener(EVENTO_OFERTA, ouvir);
    return () => window.removeEventListener(EVENTO_OFERTA, ouvir);
  }, [avaliar]);

  // 2. O pedido adiado: de novo quando a rodada fecha e a cada 5 s, até valer ou vencer.
  useEffect(() => {
    const tentar = () => {
      const a = adiado.current;
      if (!a || atualRef.current) return;
      if (Date.now() > a.ate) {
        adiado.current = null;
        return;
      }
      adiado.current = null;
      avaliar(a.momento);
    };
    const id = window.setInterval(tentar, INTERVALO_DE_NOVA_TENTATIVA_MS);
    window.addEventListener('babel:rodada-fechou', tentar);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('babel:rodada-fechou', tentar);
    };
  }, [avaliar]);

  // 3. A cota perto do fim (só com conta).
  useEffect(() => {
    const conferir = () => {
      if (estadoDeIdentidade() !== 'conta') return;
      void verificarCota().then((estado) => {
        if (estado === 'perto') dispararOferta('cota_proxima', { origem: 'consumo' });
        else if (estado === 'esgotada') dispararOferta('fim_de_cota', { origem: 'consumo' });
      });
    };
    const primeira = window.setTimeout(conferir, 5_000);
    const id = window.setInterval(conferir, INTERVALO_DA_COTA_MS);
    const semPlano = onPlanChange(conferir);
    return () => {
      window.clearTimeout(primeira);
      window.clearInterval(id);
      semPlano();
    };
  }, []);

  if (!atual) return null;

  const { decisao, momento, rotulos } = atual;
  const g = decisao.gatilho;
  const sugerido = decisao.planoSugerido;
  const fechar = () => setAtual(null);

  const agir = () => {
    registrarEventoDeOferta('oferta_clicada', rotulos);
    lembrarAtribuicao(rotulos);
    fechar();
    if (sugerido === 'conta') {
      aoEntrar();
      return;
    }
    pedirDestaqueEmPlanos(sugerido === 'nenhum' ? { aba: 'consumo' } : { plano: sugerido });
    aoVerPlanos();
  };
  const dispensar = () => {
    registrarDispensa(g.id);
    registrarEventoDeOferta('oferta_dispensada', rotulos);
    fechar();
  };
  const naoMostrar = () => {
    registrarNaoMostrar(g.id);
    registrarEventoDeOferta('oferta_nao_mostrar', rotulos);
    fechar();
  };

  const titulo = resolverTextoRemoto(g.titulo, idioma, t);
  const texto = resolverTextoRemoto(g.texto, idioma, t);
  /* Quem não tem plano a subir (Pro) vê o consumo, não uma venda. */
  const cta = sugerido === 'nenhum' ? t('Ver consumo do mês') : resolverTextoRemoto(g.cta, idioma, t);
  const selo = seloDoPlano(sugerido, t);
  const props = {
    icone: ICONE[momento],
    titulo,
    texto,
    cta,
    selo,
    aoAgir: agir,
    aoDispensar: dispensar,
    aoNaoMostrar: naoMostrar,
  };
  return renderizar(decisao.componente, props);
}

function renderizar(componente: ComponenteDeOferta, props: Parameters<typeof ModalDeOferta>[0]) {
  if (componente === 'modal') return <ModalDeOferta {...props} />;
  return <CartaoDeOferta tom={componente === 'aviso_cota' ? 'alerta' : 'acento'} {...props} />;
}

/** "Sugerido: Essencial · R$ 19,90/mês" — o preço da matriz, nunca escrito à mão. */
function seloDoPlano(sugerido: PlanoSugerido, t: (s: string, v?: Record<string, string | number>) => string) {
  if (sugerido !== 'essencial' && sugerido !== 'pro') return undefined;
  const nome = sugerido === 'pro' ? 'Pro' : 'Essencial';
  const preco = precoDoPlano(sugerido);
  return preco
    ? t('Sugerido: {plano} · R$ {preco}/mês', { plano: nome, preco })
    : t('Sugerido: {plano}', { plano: nome });
}
