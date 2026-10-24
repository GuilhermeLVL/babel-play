import { type ReactNode, useEffect, useRef, useState } from 'react';

import {
  FLAG_STT_AO_VIVO,
  FLAG_VENDA_PLANOS_V3,
  horasDeTranscricao,
  PLAN_MATRIX,
  type PlanoPago,
  planosAVenda,
} from '../../../../core/planos';
import type { DecisaoDeRota, NivelDeServico } from '../../../../core/rota/politicaDeRota';
import { getActiveProfile } from '../../../../gateway/activeProfile';
import type { SttQuality } from '../../../../gateway/sttRouter';
import { estadoDoChip } from '../../../../lib/captura/estadoDaCaptura';
import {
  escolhaDaPreferencia,
  marcaDoSelo,
  type Medidor,
  medidoresDoUso,
  NIVEIS,
  niveisDaTela,
  nivelDoSelo,
  quemTemONivel,
} from '../../../../lib/captura/nivelDeServico';
import type { LinhaDoMotor } from '../../../../lib/captura/painelDoProcessamento';
import { type SeloDaFala, seloDaFala } from '../../../../lib/captura/seloDaFala';
import { useSemRede } from '../../../../lib/captura/useSemRede';
import { consentiuNuvem } from '../../../../lib/consentimentoDeNuvem';
import type { TipoDeDispositivo } from '../../../../lib/dispositivo/perfil';
import { edicaoEstatica } from '../../../../lib/edicaoEstatica';
import { getEntitlements } from '../../../../lib/entitlements';
import { escolherProcessamento, useLadoDoProcessamento } from '../../../../lib/escolhaDoProcessamento';
import { flagLigada } from '../../../../lib/flags';
import { numero, t } from '../../../../lib/i18n';
import { celular } from '../../../../lib/polimento/captura';
import { provaDosPlanos } from '../../../../lib/polimento/planos';
import { sentir } from '../../../../lib/polimento/sentidos';
import { perfilProtegido } from '../../../../lib/protecaoDoMenor';
import { carregarUso, type UsoDoMes } from '../../../../lib/uso';
import { toast } from '../../../Toast';
import { ChipDeEstado } from '../enxuta/pecas';
import PainelDeProcessamento from '../PainelDeProcessamento';
import FolhaComoFunciona from './FolhaComoFunciona';
import FolhaDoCadeado, { type AparelhoDoNivel } from './FolhaDoCadeado';
import { ChipDoMedidor, MarcaDeOnde, type NivelDoSeletor, NotaDoPronto, SeletorDeNivel } from './pecas';

/** O que a captura (`LiveCapture`) entrega: o selo, a preferência que já existia e a porta dos planos. */
export interface NiveisDaCaptura {
  /** O selo da fala (`seloDaFala.ts`): a MESMA fonte da janela "Modelo no dispositivo". */
  selo: SeloDaFala | null;
  /** A preferência "Qualidade da transcrição", como está gravada. */
  qualidade: SttQuality;
  /** Grava a preferência (estado, espelho local e servidor), como o seletor dos Ajustes da captura. */
  aoEscolherQualidade: (q: SttQuality) => void;
  tipoDoAparelho: TipoDeDispositivo;
  /** A porta para a tela Planos. Ausente = sem oferta (perfil protegido, edição estática). */
  aoVerPlanos?: (plano: PlanoPago | null) => void;
  /**
   * O que o painel de processamento mostra (tela enxuta): quem transcreve e quem traduz, e a porta para
   * Ajustes → Processamento. Ausente = o painel sem as linhas dos motores.
   */
  processamento?: {
    transcricao: LinhaDoMotor;
    traducao: LinhaDoMotor | null;
    /** Ausente (gravando, sem navegação) = sem o link "Modelos no aparelho". */
    aoVerModelosNoAparelho?: () => void;
  };
  /** O que a tela lê do app. Os testes passam o deles; em uso, vem de `ambienteReal()`. */
  ambiente?: Partial<AmbienteDosNiveis>;
}

export interface AmbienteDosNiveis {
  capacidades: { managedCloudStt: boolean; sttAoVivo: boolean };
  protegido: boolean;
  /** Edição estática: não há plano a assinar. */
  semPlanos: boolean;
  /** Os planos pagos à venda agora. */
  aVenda: readonly PlanoPago[];
  consentiuNuvem: boolean;
  /** Lê `/api/me/uso`. `null` = sem resposta. */
  carregarUso: () => Promise<UsoDoMes | null>;
}

const emDesenvolvimento = (): boolean => !!(import.meta as unknown as { env?: Record<string, unknown> }).env?.DEV;

/**
 * O que a tela lê do app. Em DESENVOLVIMENTO o plano e os planos à venda podem ser os de prova
 * (`provaDosPlanos`, as mesmas chaves da tela Planos): o servidor local é self-host, e sem isto ninguém
 * vê o cadeado. Num build de produção a prova devolve tudo vazio.
 */
function ambienteReal(): AmbienteDosNiveis {
  const prova = provaDosPlanos();
  const doPlano = prova.plano ? PLAN_MATRIX[prova.plano].entitlements : getEntitlements();
  return {
    capacidades: { managedCloudStt: doPlano.managedCloudStt, sttAoVivo: doPlano.sttAoVivo },
    protegido: perfilProtegido(),
    semPlanos: edicaoEstatica(),
    aVenda:
      prova.aVenda ??
      planosAVenda((chave) => (chave === FLAG_VENDA_PLANOS_V3 || chave === FLAG_STT_AO_VIVO) && flagLigada(chave)),
    consentiuNuvem: consentiuNuvem(),
    carregarUso,
  };
}

/**
 * O SELO DE PROVA — SÓ EM DESENVOLVIMENTO, para o comparador (`scripts/polimento/roteiros/niveis-*.json`):
 * com `localStorage['babel.px.seloDeProva'] = 'nuvem'` a tela DESENHA a captura de quem está na nuvem do
 * Babel (o servidor local não tem nuvem configurada, e sem isto ninguém vê a marca da nuvem). O selo sai
 * da função de verdade (`seloDaFala`), com uma decisão montada à mão. Num build de produção, `null`.
 */
function seloDeProva(): SeloDaFala | null {
  if (!emDesenvolvimento()) return null;
  try {
    if (localStorage.getItem('babel.px.seloDeProva') !== 'nuvem') return null;
  } catch {
    return null;
  }
  const decisao: DecisaoDeRota = {
    nivel: 'precisao',
    rota: { degrau: 'nuvem-por-trechos', motivo: 'nuvem-primeiro', motor: 'groq-whisper' },
    reservas: [],
    descartadas: [],
    processamento: { onde: 'nuvem', enviaDadosA: 'nos' },
    explicacao: { chave: 'A nuvem está disponível na sua conta e erra menos.' },
    acao: null,
  };
  return seloDaFala(decisao);
}

const aparelhoDoTipo = (tipo: TipoDeDispositivo): AparelhoDoNivel =>
  tipo === 'quest' ? 'quest' : tipo.startsWith('celular') ? 'celular' : tipo === 'desktop-com-gpu' ? 'pc' : 'fraco';

const nomeDoPlano = (p: PlanoPago): string => t(PLAN_MATRIX[p].rotulo);

/**
 * O último consumo lido nesta página. A captura remonta a cada visita, e sem isto o medidor e a nota das
 * horas chegariam sempre DEPOIS da entrada da tela (um salto, em vez da cascata do protótipo). O número
 * guardado vale só até a resposta nova chegar, logo em seguida.
 */
let ultimoUso: { de: AmbienteDosNiveis['carregarUso']; uso: UsoDoMes } | null = null;

type FolhaAberta = { qual: 'como' } | { qual: 'painel' } | { qual: 'tranca'; nivel: 'precisao' | 'aovivo' } | null;

export interface PecasDosNiveis {
  /** A fileira `.pl-linha`: seletor, marca (estreita) e medidor. Vai logo abaixo do topo. Na tela enxuta, nada. */
  linha: ReactNode;
  /**
   * O SELO COMPACTO da tela enxuta (era o chip de estado de `enxuto.js:62-65`): só o ícone, que abre o
   * painel de processamento (no computador, o popover vem junto, ancorado nele). `null` fora da tela enxuta.
   */
  chipDeEstado: ReactNode;
  /** A marca do topo (`pl-so-largo`). */
  marcaDoTopo: ReactNode;
  /** A nota da tela pronta (horas esgotadas, sem internet). Vai dentro do miolo. */
  nota: ReactNode;
  /** As folhas "Como isto funciona" e do cadeado. */
  folhas: ReactNode;
  /** O nível em uso, pelo selo. */
  emUso: NivelDeServico | null;
  /**
   * `planos4.js:266-268`: o chip "Modelo local" só diz a verdade com o modelo local em uso, e some no
   * celular (lá quem transcreve é um recurso do aparelho).
   */
  modeloOculto: boolean;
}

const NADA: PecasDosNiveis = {
  linha: null,
  chipDeEstado: null,
  marcaDoTopo: null,
  nota: null,
  folhas: null,
  emUso: null,
  modeloOculto: false,
};

/**
 * O NÍVEL DE SERVIÇO NA CAPTURA, COM O DADO REAL (porte de `pintarNivelNoVivo()`, `escolherNivel()`,
 * `abrirTranca()` e `abrirComo()`, `planos4.js:251-437`).
 *
 * Devolve as peças prontas para `CapturaDoPrototipo` pôr nos lugares do protótipo. `dados` ausente =
 * a tela não mostra nada disto (quem chama não é a captura).
 */
export function useNiveisDaCaptura(
  dados: NiveisDaCaptura | undefined,
  tela: {
    gravando: boolean;
    /** No Quest a captura fica como está: só o seletor e a marca (decisão do dono, 10/10/2026). */
    noQuest: boolean;
    /** A linha do modelo local ("Modelo local · 589 MB"), para a folha. */
    modelo?: string | null;
    aoAbrirModelo?: () => void;
    /**
     * A TELA ENXUTA (protótipo `telas-enxutas`): a fileira e a marca saem, e o chip de estado e a folha
     * ficam com o que elas faziam.
     */
    enxuta?: boolean;
    /** A captura está pausada pela pessoa (o chip diz "Pausado"). */
    pausada?: boolean;
    /** O par de idiomas como o chip o escreve enquanto grava. */
    par?: string;
    /** A ajuda da captura: na tela enxuta ela mora na folha. */
    aoAbrirAjuda?: () => void;
  },
): PecasDosNiveis {
  const semRede = useSemRede();
  const lerDoApp = dados?.ambiente?.carregarUso ?? carregarUso;
  const [uso, setUso] = useState<UsoDoMes | null>(() => (ultimoUso?.de === lerDoApp ? ultimoUso.uso : null));
  const [folha, setFolha] = useState<FolhaAberta>(null);
  const seloRef = useRef<HTMLButtonElement>(null);

  const amb: AmbienteDosNiveis | null = dados ? { ...ambienteReal(), ...dados.ambiente } : null;
  const temNuvem = !!amb && amb.capacidades.managedCloudStt && !amb.semPlanos;
  /* O lado Aparelho | Nuvem marcado: o MESMO dos Ajustes (`lib/escolhaDoProcessamento`). */
  const lado = useLadoDoProcessamento(temNuvem && !amb?.protegido);
  const ler = amb?.carregarUso;

  /* As horas do mês: só para quem tem nuvem no plano, e de novo quando uma captura termina. */
  useEffect(() => {
    if (!temNuvem || !ler || tela.gravando) return;
    let vivo = true;
    void ler().then((u) => {
      if (!vivo) return;
      ultimoUso = u ? { de: ler, uso: u } : null;
      setUso(u);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ler` é o mesmo a cada render (o módulo ou o do teste)
  }, [temNuvem, tela.gravando]);

  if (!dados || !amb) return NADA;

  const selo = seloDeProva() ?? dados.selo;
  const emUso = nivelDoSelo(selo);
  const aparelho = provaDosPlanos().aparelho ?? aparelhoDoTipo(dados.tipoDoAparelho);
  const medidores: Medidor[] = temNuvem && !tela.noQuest ? medidoresDoUso(uso) : [];
  const horasAcabaram = medidores.length > 0 && medidores[0].acabou;
  const marca = selo ? marcaDoSelo(selo, { semRede, horasAcabaram }) : null;

  const quem = {
    precisao: quemTemONivel('precisao', amb.aVenda),
    aovivo: quemTemONivel('aovivo', amb.aVenda),
  };
  const niveis: NivelDoSeletor[] = niveisDaTela(amb).map((n) => ({
    ...n,
    plano:
      !n.tranca || n.nivel === 'aparelho' || (n.nivel === 'aovivo' && amb.capacidades.sttAoVivo)
        ? null
        : quem[n.nivel][0]
          ? nomeDoPlano(quem[n.nivel][0].plano)
          : null,
  }));

  /** `escolherNivel()` de `planos4.js:317-328`: grava a preferência que já existia. Diz se gravou. */
  const escolher = (n: NivelDeServico): boolean => {
    const item = niveis.find((x) => x.nivel === n);
    if (!item) return false;
    if (item.tranca) {
      if (n !== 'aparelho') setFolha({ qual: 'tranca', nivel: n });
      return false;
    }
    if (n === 'aovivo') return false; // sem transporte não há o que gravar (e hoje ele sempre tem cadeado)
    const N = NIVEIS[n];
    if (semRede && n !== 'aparelho') {
      toast.info(t('Sem internet: agora só o nível No aparelho funciona.'));
      return false;
    }
    if (n === 'precisao' && medidores.find((m) => m.nivel === 'precisao')?.acabou) {
      toast.info(t('As horas do nível {nivel} deste mês acabaram. Elas voltam no dia 1º.', { nivel: t(N.nome) }));
      return false;
    }
    /* A escolha inteira (modo, chave e qualidade) é a dos Ajustes: `escolherProcessamento`. A Captura
       recebe a qualidade nova pelo aviso dele (`EVENTO_DO_PROCESSAMENTO`). */
    void escolherProcessamento(n === 'precisao' ? 'nuvem' : 'aparelho', {
      perfil: getActiveProfile().id === 'local-private' ? 'local-private' : 'free-web',
    });
    sentir('aba');
    /* O protótipo diz a razão quando o nível pedido não é o que fica valendo (`planos4.js:326-327`).
       Aqui a razão que a tela já conhece é a do aceite: sem ele a nuvem não recebe nada. */
    toast.info(
      n === 'precisao' && !amb.consentiuNuvem
        ? t('Você ainda não autorizou o envio para fora do aparelho.')
        : `${t(N.nome)}: ${t(N.curto)}`,
    );
    return true;
  };

  const abrirComo = () => setFolha({ qual: 'como' });

  /* O plano à venda com MAIS horas de Precisão que o da pessoa: a porta da nota das horas esgotadas. */
  const deCima = horasAcabaram
    ? amb.aVenda.find((p) => (horasDeTranscricao(p) ?? 0) * 60 > medidores[0].total)
    : undefined;
  const verPlanos = amb.protegido || amb.semPlanos ? undefined : dados.aoVerPlanos;

  const linha = tela.enxuta ? null : (
    <div className="pl-linha" data-testid="fileira-do-nivel">
      <SeletorDeNivel niveis={niveis} emUso={emUso} aoEscolher={escolher} />
      {selo && marca && <MarcaDeOnde selo={selo} marca={marca} classe="pl-so-estreito" aoAbrir={abrirComo} />}
      <span className="q-espaco" />
      <span className="pl-vaga">
        {medidores.length > 0 && <ChipDoMedidor medidores={medidores} emUso={emUso} aoAbrir={abrirComo} />}
      </span>
    </div>
  );
  const marcaDoTopo =
    !tela.enxuta && selo && marca ? (
      <MarcaDeOnde selo={selo} marca={marca} classe="pl-so-largo" aoAbrir={abrirComo} />
    ) : null;
  /* O PAINEL DE PROCESSAMENTO (plano 2026-10-23, Task 4): o segmentado grava a MESMA escolha da aba
     Processamento dos Ajustes (`lib/escolhaDoProcessamento`) e, junto, a preferência do nível — sem ela,
     quem tem nuvem no plano continuaria indo à nuvem no automático. A nuvem com chave própria só muda
     quando há chave cadastrada; sem chave, fica a nuvem do plano. */
  const nuvemTrancada: { trancada: true; porque: string } | null = amb.protegido
    ? { trancada: true, porque: t('A nuvem não está disponível neste perfil.') }
    : amb.semPlanos
      ? { trancada: true, porque: t('A nuvem não está disponível nesta versão.') }
      : !amb.capacidades.managedCloudStt
        ? { trancada: true, porque: t('O seu plano não tem horas de nuvem: a legenda roda no aparelho, sem limite.') }
        : null;
  const escolherNoPainel = (e: 'aparelho' | 'nuvem') => {
    if (e === 'nuvem' && nuvemTrancada) return;
    escolher(e === 'nuvem' ? 'precisao' : 'aparelho');
  };
  const noCelular = celular();
  const aberto = folha?.qual === 'painel';
  const painel = aberto ? (
    <PainelDeProcessamento
      onde={selo?.onde ?? null}
      escolha={lado}
      nuvem={nuvemTrancada}
      aoEscolher={escolherNoPainel}
      transcricao={dados.processamento?.transcricao ?? null}
      traducao={dados.processamento?.traducao ?? null}
      aoVerModelo={tela.aoAbrirModelo}
      carregarUso={amb.carregarUso}
      aoModelosNoAparelho={dados.processamento?.aoVerModelosNoAparelho}
      aoUsoEPlano={verPlanos && (() => verPlanos(null))}
      aoComoFunciona={abrirComo}
      celular={noCelular}
      ancora={seloRef}
      aoFechar={() => setFolha((f) => (f?.qual === 'painel' ? null : f))}
    />
  ) : null;
  const chipDeEstado = tela.enxuta ? (
    <span className="ex-selo-ancora">
      <ChipDeEstado
        ref={seloRef}
        estado={estadoDoChip(
          { selo, gravando: tela.gravando, pausada: !!tela.pausada, medidores, emUso, par: tela.par ?? '' },
          t,
        )}
        marca={marca}
        aberto={aberto}
        aoAbrir={() => setFolha(aberto ? null : { qual: 'painel' })}
      />
      {!noCelular && painel}
    </span>
  ) : null;
  /* `enxuto.js:171-173`: a folha diz que não há nuvem a quem não a tem no plano, com as horas dos planos
     À VENDA (as de verdade, de `quemTemONivel`). Sem oferta (perfil protegido, edição estática), nada. */
  const comHoras = quem.precisao.filter((p) => p.aVenda && p.horasNoMes !== null);
  const horasDe = (p: (typeof comHoras)[number]) => `${numero(p.horasNoMes ?? 0)} h`;
  const semNuvem =
    amb.capacidades.managedCloudStt || amb.semPlanos || amb.protegido
      ? null
      : [
          t('O seu plano não tem horas de nuvem: a legenda roda no aparelho, sem limite.'),
          comHoras.length > 1
            ? t('O {plano} tem {horas} por mês; o {outro}, {outras}.', {
                plano: nomeDoPlano(comHoras[0].plano),
                horas: horasDe(comHoras[0]),
                outro: nomeDoPlano(comHoras[1].plano),
                outras: horasDe(comHoras[1]),
              })
            : comHoras.length === 1
              ? t('O {plano} tem {horas} por mês.', {
                  plano: nomeDoPlano(comHoras[0].plano),
                  horas: horasDe(comHoras[0]),
                })
              : '',
        ]
          .filter(Boolean)
          .join(' ');
  const nota = tela.noQuest ? null : (
    <NotaDoPronto
      medidores={medidores}
      semRede={semRede}
      planoDeCima={deCima ? { nome: nomeDoPlano(deCima), horas: `${numero(horasDeTranscricao(deCima) ?? 0)} h` } : null}
      aoVerPlano={deCima && verPlanos ? () => verPlanos(deCima) : undefined}
    />
  );

  const folhas =
    folha?.qual === 'painel' ? (
      noCelular ? (
        painel
      ) : null
    ) : folha?.qual === 'como' ? (
      <FolhaComoFunciona
        selo={selo}
        marca={marca}
        niveis={niveis}
        emUso={emUso}
        medidores={medidores}
        escolha={escolhaDaPreferencia(dados.qualidade)}
        modelo={emUso === 'aparelho' && aparelho !== 'celular' ? tela.modelo : null}
        aoEscolher={escolher}
        aoAutomatico={() => {
          dados.aoEscolherQualidade('auto');
          toast.info(t('Escolha automática: o app decide a cada sessão.'));
        }}
        aoVerPlanos={verPlanos ? () => verPlanos(null) : undefined}
        aoVerModelo={tela.aoAbrirModelo}
        enxuta={tela.enxuta ? { semNuvem, aoAjuda: tela.aoAbrirAjuda } : undefined}
        aoFechar={() => setFolha(null)}
      />
    ) : folha?.qual === 'tranca' ? (
      <FolhaDoCadeado
        nivel={folha.nivel}
        aparelho={aparelho}
        quem={quem[folha.nivel]}
        jaIncluso={folha.nivel === 'aovivo' && amb.capacidades.sttAoVivo}
        aoVerPlano={verPlanos}
        aoComo={abrirComo}
        aoFechar={() => setFolha(null)}
      />
    ) : null;

  return {
    linha,
    chipDeEstado,
    marcaDoTopo,
    nota,
    folhas,
    emUso,
    modeloOculto: emUso === 'precisao' || aparelho === 'celular',
  };
}
