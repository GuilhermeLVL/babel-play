import { UserRound } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  estadoDoLadoNaConversa,
  type LadoDaConversa,
  LADO_MINIMO_NO_CELULAR,
  ladoComAvisosEmPx,
  ladoDoAvatarEmPx,
  politicaDosAvatares,
} from '../../../../core/avatar/interprete';
import { sinaisHabilitados } from '../../../../core/avatar/sinais/contraste';
import {
  alfabetoDaConversa,
  decidirSoletracao,
  type MotivoDoPainel,
  type SuporteDoInterprete,
  suporteComModelo,
} from '../../../../core/avatar/sinais/soletracaoDoInterprete';
import { FLAG_AVATAR_3D, FLAG_AVATAR_SINAIS } from '../../../../core/planos';
import { modeloDaColecao } from '../../../../data/avatar/colecao';
import { publicarAvatarDoPip } from '../../../../lib/avatar/avatarDoPip';
import { destravarComAvatar } from '../../../../lib/avatar/destravarComAvatar';
import { detectarTier, temWebGL2 } from '../../../../lib/avatar/detectarTier';
import type { SessaoDeAvatar } from '../../../../lib/avatar/motor';
import { criarPonteDaVoz, type PonteDaVoz, useVozTocando } from '../../../../lib/avatar/ponteDaVoz';
import { usePreferenciasDosAvatares } from '../../../../lib/avatar/preferenciasDoInterprete';
import type { EstadoDoControle } from '../../../../lib/captura/controleDoInterprete';
import { useFlag } from '../../../../lib/flags';
import { t } from '../../../../lib/i18n';
import AvatarDaConversa, { useReceitaDoDono } from '../../../avatar/AvatarDaConversa';
import SoletracaoNaConversa, { type AtualDaSoletracao, PalcoNaConversa } from '../../../avatar/SoletracaoNaConversa';
import { useSoletracaoAtiva } from '../../../avatar/useSoletracaoAtiva';
import type { AvataresDaConversa } from './ConversaDoPrototipo';
import PainelDosAvatares from './PainelDosAvatares';

export interface AvataresDoInterprete {
  /** Os avatares estão ligados (flag, preferência e modo economia)? Falso = a tela é a de antes. */
  ativo: boolean;
  /** O motor de voz passa por aqui para a boca acompanhar; desligada, devolve o motor como veio. */
  ponte: PonteDaVoz;
  /** Troca o destravador da voz pelo que também prepara o analisador, dentro do mesmo gesto. */
  destravar: (original: () => void) => () => void;
  /** O avatar de um LADO DO MOTOR (`meu`/`outro`), ou `undefined` onde não há. */
  doLado: (lado: LadoDaConversa) => ReactNode;
  /**
   * A soletração do avatar-intérprete na metade desse lado (avisos fixos e, quando há um nome, as mãos), ou
   * `undefined`. Sem as duas flags, sem a opção ou com um modelo sem dedos, nunca existe.
   */
  soletracaoDoLado: (lado: LadoDaConversa) => ReactNode;
  /** O botão e o painel de configuração; `undefined` sem a flag. */
  avatares: AvataresDaConversa | undefined;
}

/**
 * OS AVATARES DO INTÉRPRETE. Tudo atrás de `avatar_3d`: sem a flag o hook devolve `ativo: false`, nenhum nó e a ponte
 * desligada, e a tela é exatamente a de antes. O estado de cada avatar vem do `estado()` do controle (fase, lado,
 * falando) e do motor de voz (`useVozTocando`); a legenda não depende de nada daqui.
 */
export function useAvataresDoInterprete({
  estado,
  layout,
  idiomaDaOutra,
}: {
  estado: EstadoDoControle;
  layout: 'celular' | 'computador' | 'quest';
  /** O idioma da OUTRA pessoa (o combinado ou o detectado): escolhe Libras ou ASL no automático. */
  idiomaDaOutra?: string | null | undefined;
}): AvataresDoInterprete {
  const flag = useFlag(FLAG_AVATAR_3D);
  const sinais = useFlag(FLAG_AVATAR_SINAIS);
  const [prefs, guardar] = usePreferenciasDosAvatares();
  const ponteRef = useRef<PonteDaVoz | null>(null);
  ponteRef.current ??= criarPonteDaVoz();
  const ponte = ponteRef.current;

  // O que só se mede com a flag ligada (a sonda de WebGL2 cria um contexto descartável).
  const medido = useMemo(
    () => (flag ? { tier: detectarTier(), webgl2: temWebGL2() } : { tier: 'fraco' as const, webgl2: true }),
    [flag],
  );
  const politica = politicaDosAvatares({ flag, prefs, webgl2: medido.webgl2, tier: medido.tier, sinais });
  const ativo = politica.mostrar;

  /* A SOLETRAÇÃO (flags `avatar_3d` + `avatar_sinais`): o modelo do avatar-intérprete precisa ter dedos articulados, e isso
     só se sabe com o modelo carregado (a sessão do avatar da conversa entrega o modelo). */
  const sinaisOk = sinaisHabilitados({ avatar_3d: flag, avatar_sinais: sinais });
  const [suporteDaSessao, setSuporteDaSessao] = useState<SuporteDoInterprete>({ estado: 'verificando' });
  const verificacao = useRef(0);
  const sinaisOkRef = useRef(sinaisOk);
  sinaisOkRef.current = sinaisOk;
  const aoSessaoDoInterprete = useCallback((sessao: SessaoDeAvatar | null) => {
    const minha = ++verificacao.current;
    setSuporteDaSessao({ estado: 'verificando' });
    if (!sessao || !sinaisOkRef.current) return;
    void import('../../../../lib/avatar/maos').then((m) => {
      if (minha !== verificacao.current) return;
      const r = m.suportaSinais({ objeto: sessao.avatar.objeto, vrm: sessao.avatar.vrm });
      setSuporteDaSessao(
        r.suporta === true ? { estado: 'sim' } : { estado: 'nao', motivo: (r as { motivo: MotivoDoPainel }).motivo },
      );
    });
  }, []);
  const receitaDoOutro = useReceitaDoDono('outro');
  const modeloDoOutro =
    receitaDoOutro?.base.origem === 'colecao' ? (modeloDaColecao(receitaDoOutro.base.id) ?? null) : null;
  const interpreteNaTela = ativo && politica.donos.includes('outro');
  const suporte: SuporteDoInterprete = !medido.webgl2
    ? { estado: 'nao', motivo: 'sem_3d' }
    : !interpreteNaTela
      ? { estado: 'nao', motivo: 'sem_interprete' }
      : suporteComModelo(suporteDaSessao, modeloDoOutro);
  const soletrarAtivo = sinaisOk && politica.soletrar && suporte.estado === 'sim';
  const camera: 'corpo' | 'maos' = politica.foco === 'maos' ? 'maos' : 'corpo';
  const alfabeto = alfabetoDaConversa(prefs.alfabeto, idiomaDaOutra);
  const naFilaRef = useRef(0);
  naFilaRef.current = estado.naFila ?? 0;
  /* A decisão é POR FALA e fica fixa enquanto a fala está em voz: a fila crescer atrás dela não corta a soletração dela. */
  const falandoAgora = estado.falando;
  const decisao = useMemo(
    () =>
      decidirSoletracao({
        ligada: soletrarAtivo,
        item: falandoAgora ? { id: falandoAgora.id, texto: falandoAgora.texto, manual: falandoAgora.manual } : null,
        naFila: naFilaRef.current,
        alfabeto,
        ritmo: prefs.ritmo,
        espelhar: prefs.espelhar,
      }),
    [soletrarAtivo, falandoAgora, alfabeto, prefs.ritmo, prefs.espelhar],
  );
  const itemId = falandoAgora?.id ?? null;
  /* A soletração em curso, em sincronia com a fila de voz (outra fala entra: a anterior é abandonada). */
  const { ativa, pulada, aoFim } = useSoletracaoAtiva(decisao, itemId);
  const [atualDaSoletracao, setAtualDaSoletracao] = useState<AtualDaSoletracao | null>(null);
  useEffect(() => {
    if (!ativa) setAtualDaSoletracao(null);
  }, [ativa]);
  const soletracaoDoPip = useMemo(
    () => (soletrarAtivo ? { camera, decisao, itemId } : null),
    [soletrarAtivo, camera, decisao, itemId],
  );

  useEffect(() => {
    ponte.ativar(ativo);
  }, [ponte, ativo]);
  useEffect(() => () => ponte.dispose(), [ponte]);
  const vozTocando = useVozTocando(ponte);

  const [painelAberto, setPainelAberto] = useState(false);
  const ativoRef = useRef(ativo);
  ativoRef.current = ativo;
  const destravar = useMemo(() => (original: () => void) => destravarComAvatar(original, () => ativoRef.current), []);

  const tamanhoPref = ladoDoAvatarEmPx(prefs.tamanho, layout);
  /* No celular, com os dois avisos fixos embaixo do idioma, o círculo do intérprete cede espaço ao texto da conversa. */
  const apertado = soletrarAtivo && layout !== 'computador';
  const tamanhoDoInterprete = apertado ? ladoComAvisosEmPx(tamanhoPref) : tamanhoPref;
  /* O círculo da pessoa também encolhe: as duas metades dividem a altura, e a frase precisa de ao menos 3 linhas. */
  const tamanhoDaPessoa = apertado ? Math.min(tamanhoPref, LADO_MINIMO_NO_CELULAR) : tamanhoPref;
  const donoDe = (lado: LadoDaConversa): LadoDaConversa =>
    estado.trocados ? (lado === 'meu' ? 'outro' : 'meu') : lado;
  /* O PiP lê o estado por DONO (a pessoa, o intérprete): é UM avatar só, o de quem tem atividade. */
  const estadoDoMeu = estadoDoLadoNaConversa(donoDe('meu'), estado, vozTocando);
  const estadoDoOutro = estadoDoLadoNaConversa(donoDe('outro'), estado, vozTocando);
  useEffect(() => {
    publicarAvatarDoPip(
      ativo
        ? {
            ativo: true,
            estados: { meu: estadoDoMeu, outro: estadoDoOutro },
            boca: ponte.pose,
            soletracao: soletracaoDoPip,
          }
        : null,
    );
  }, [ativo, estadoDoMeu, estadoDoOutro, ponte, soletracaoDoPip]);
  useEffect(() => () => publicarAvatarDoPip(null), []);

  const doLado = (lado: LadoDaConversa): ReactNode => {
    if (!ativo) return undefined;
    const dono = donoDe(lado);
    if (!politica.donos.includes(dono)) return undefined;
    const meuEstado = estadoDoLadoNaConversa(lado, estado, vozTocando);
    const comABoca = meuEstado === 'falando';
    const rosto = (
      <AvatarDaConversa
        dono={dono}
        estado={meuEstado}
        fonteDaBoca={comABoca ? ponte.pose : null}
        tamanho={dono === 'outro' ? tamanhoDoInterprete : tamanhoDaPessoa}
        tier={politica.tier}
        anunciar={prefs.anunciar}
        {...(dono === 'outro' && sinaisOk ? { aoSessao: aoSessaoDoInterprete } : {})}
      />
    );
    if (dono !== 'outro' || !sinaisOk) return rosto;
    /* Com as duas flags o avatar-intérprete SEMPRE mora neste envoltório (a estrutura não muda quando a soletração
       começa ou acaba: trocar a árvore reabriria o modelo e perderia a verificação dos dedos). Soletrando, as mãos
       cobrem o círculo; o rosto fica por baixo (vivo) e volta quando a soletração acaba. */
    return (
      <div style={{ position: 'relative', lineHeight: 0 }} data-soletrando={soletrarAtivo && ativa ? '' : undefined}>
        {rosto}
        {soletrarAtivo && ativa && (
          <div
            data-testid="soletracao-palco"
            style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#1d1a17' }}
          >
            <PalcoNaConversa
              ativa={ativa}
              camera={camera}
              tier="fraco"
              tamanho={tamanhoDoInterprete}
              aoAtual={setAtualDaSoletracao}
              aoFim={aoFim}
            />
            {layout !== 'computador' && atualDaSoletracao?.palavra && (
              <p className="int-soletra-mini" data-testid="soletracao-atual-mini">
                <strong aria-hidden="true">{atualDaSoletracao.letra}</strong>
                <span data-palavra-atual aria-current="true">
                  {atualDaSoletracao.palavra}
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  const soletracaoDoLado = (lado: LadoDaConversa): ReactNode => {
    if (!soletrarAtivo || donoDe(lado) !== 'outro') return undefined;
    return (
      <SoletracaoNaConversa
        soletrando={!!ativa}
        pulada={pulada}
        atual={layout !== 'computador' ? null : atualDaSoletracao}
        compacto={layout !== 'computador'}
        anunciar={prefs.anunciar}
      />
    );
  };

  const avatares: AvataresDaConversa | undefined = flag
    ? {
        botao: (
          <button
            type="button"
            className="int-modo"
            aria-haspopup="dialog"
            aria-expanded={painelAberto}
            aria-pressed={ativo}
            aria-label={t('Avatares da conversa')}
            onClick={() => setPainelAberto((v) => !v)}
            data-testid="avatares-da-conversa"
          >
            <UserRound aria-hidden />
            <span className="int-modo-txt" aria-hidden>
              {t('Avatares')}
            </span>
          </button>
        ),
        painel: ({ escolherVoz }) =>
          painelAberto ? (
            <PainelDosAvatares
              prefs={prefs}
              aoMudar={guardar}
              aoFechar={() => setPainelAberto(false)}
              sinaisLigada={sinais}
              suporte={suporte}
              sem3d={!medido.webgl2}
              aoEscolherVoz={escolherVoz}
            />
          ) : null,
      }
    : undefined;

  return { ativo, ponte, destravar, doLado, soletracaoDoLado, avatares };
}
