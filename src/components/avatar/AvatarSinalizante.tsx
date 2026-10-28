import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { corDaPaleta } from '../../core/avatar/paleta';
import type { ReceitaDeAvatar } from '../../core/avatar/receita';
import { fundoDeAltoContraste } from '../../core/avatar/sinais/contraste';
import { amostrar, soletrar } from '../../core/avatar/sinais/soletrar';
import type { Lingua, MotivoDeNaoSoletrar, Sequencia } from '../../core/avatar/sinais/tipos';
import type { TierDoAvatar } from '../../core/avatar/tiers';
import { carregarSinais, type DadosDeSinais } from '../../data/avatar/sinais/carregar';
import type { MotivoDoFallback } from '../../lib/avatar/fallback2d';
import type { ControleDeMaos, MotivoSemSinais } from '../../lib/avatar/maos';
import type { SessaoDeAvatar } from '../../lib/avatar/motor';
import { t } from '../../lib/i18n';
import { movimentoReduzido } from '../../lib/movimento/reduzido';
import AvatarCanvas from './AvatarCanvas';

export interface AvatarSinalizanteProps {
  /** O texto a soletrar. A legenda mostra SEMPRE o texto inteiro, soletrado ou não. */
  texto: string;
  alfabeto: Lingua;
  receita: ReceitaDeAvatar;
  tier: TierDoAvatar;
  fonte?: string | Blob;
  /** Velocidade (0,25 a 4). Padrão 1. */
  velocidade?: number;
  /** Mão canhota: espelha as poses e usa os ossos da esquerda. */
  espelhar?: boolean;
  /** `corpo` (busto) ou `maos` (só as mãos, sem cabeça). */
  camera?: 'corpo' | 'maos';
  /** Fundo que garante 3:1 contra a pele do avatar. */
  altoContraste?: boolean;
  /** Lado do quadrado do avatar, em pixels (limitado à largura disponível). */
  tamanho?: number;
  /** Muda para reiniciar a soletração do começo (o texto, a velocidade e o lado também reiniciam). */
  repetir?: number;
  /** Não toca sozinho: só prepara. Padrão: toca ao montar e quando algo muda. */
  pausado?: boolean;
  tetoMs?: number;
  soNomesProprios?: boolean;
  /**
   * Anuncia a palavra atual ao leitor de tela (`aria-live="polite"`). DESLIGADO por padrão: a legenda em texto é o
   * conteúdo, e anunciar cada palavra repetiria o que já se lê.
   */
  anunciar?: boolean;
  aoPalavra?: (indice: number) => void;
  aoFim?: () => void;
  /** O modelo não consegue soletrar (sem dedos, ossos irreconhecíveis...): a UI de futuro esconde o recurso. */
  aoNaoSuportar?: (motivo: MotivoSemSinais) => void;
  aoErro?: (motivo: MotivoDoFallback | 'dados') => void;
  /** Para diagnóstico e teste: o controle dos ossos e a sequência vigente. */
  aoPronto?: (info: { sessao: SessaoDeAvatar; controle: ControleDeMaos; sequencia: Sequencia }) => void;
}

/**
 * AVISOS FIXOS e NÃO REMOVÍVEIS. São montados à mão no DOM (não pelo React) e um `MutationObserver` os recoloca se
 * alguém os tirar, esconder ou editar. Textos obrigatórios do produto (nenhum botão fecha, nada os esconde).
 */
function avisosFixos(): Array<{ id: string; texto: string; estilo: string }> {
  return [
    {
      id: 'nao-e-traducao',
      texto: t('Soletração do alfabeto manual: não é tradução para Libras'),
      estilo: 'background:#ffe08a;color:#2a1e00;border-bottom:2px solid #7a5600',
    },
    {
      id: 'demonstracao',
      texto: t('Poses de DEMONSTRAÇÃO: ainda NÃO revisadas por pessoas surdas'),
      estilo: 'background:#ff9d8f;color:#2d0600;border-bottom:2px solid #8a1b0c',
    },
  ];
}
const ESTILO_DO_AVISO = 'display:block;padding:7px 12px;font-weight:700;font-size:13px;line-height:1.35;';

/** O `style` que NÓS gravamos em cada nó (normalizado pelo navegador): qualquer outra coisa é adulteração. */
const ESTILO_GRAVADO = new WeakMap<Element, string>();

function defineSe(el: Element, atributo: string, valor: string): void {
  if (el.getAttribute(atributo) !== valor) el.setAttribute(atributo, valor);
}

/** Idempotente: só escreve no DOM o que mudou (não dispara o próprio observador em laço). */
function preencherAvisos(caixa: HTMLElement): void {
  defineSe(caixa, 'data-avisos-fixos', '');
  defineSe(caixa, 'role', 'group');
  defineSe(caixa, 'aria-label', t('Avisos sobre a soletração'));
  if (caixa.hasAttribute('hidden')) caixa.removeAttribute('hidden');
  const estiloDaCaixa = 'display:block;position:relative;z-index:2;';
  if (!ESTILO_GRAVADO.has(caixa) || caixa.getAttribute('style') !== ESTILO_GRAVADO.get(caixa)) {
    caixa.setAttribute('style', estiloDaCaixa);
    ESTILO_GRAVADO.set(caixa, caixa.getAttribute('style') ?? '');
  }
  const esperados = avisosFixos();
  const intactos =
    caixa.children.length === esperados.length &&
    esperados.every((a, i) => {
      const el = caixa.children[i];
      return (
        el?.getAttribute('data-aviso-fixo') === a.id &&
        el.getAttribute('role') === 'note' &&
        el.textContent === a.texto &&
        el.children.length === 0 &&
        el.getAttribute('style') === ESTILO_GRAVADO.get(el) &&
        !el.hasAttribute('hidden')
      );
    });
  if (intactos) return;
  caixa.replaceChildren(
    ...esperados.map((a) => {
      const el = document.createElement('p');
      el.setAttribute('data-aviso-fixo', a.id);
      el.setAttribute('role', 'note');
      el.setAttribute('style', `margin:0;${ESTILO_DO_AVISO}${a.estilo};`);
      ESTILO_GRAVADO.set(el, el.getAttribute('style') ?? '');
      el.textContent = a.texto;
      return el;
    }),
  );
}

const MOTIVO_DA_PALAVRA: Record<MotivoDeNaoSoletrar, () => string> = {
  teto: () => t('Fora do tempo máximo da fala: não soletrada'),
  numero: () => t('Números não são soletrados'),
  sem_letras: () => t('Sem letras para soletrar'),
  uma_letra: () => t('Palavra de uma letra: não soletrada'),
  so_nomes: () => t('Só nomes próprios são soletrados'),
  dicionario: () => t('Tem sinal gravado: não soletrada'),
};

const MOTIVO_SEM_SINAIS: Record<MotivoSemSinais, () => string> = {
  sem_dedos: () => t('Este modelo não tem dedos articulados: a soletração fica indisponível.'),
  sem_braco: () => t('Este modelo não tem braços articulados: a soletração fica indisponível.'),
  sem_ossos_reconheciveis: () =>
    t('Os ossos deste modelo não têm nomes reconhecíveis: a soletração fica indisponível.'),
  sem_modelo: () => t('Sem modelo carregado: a soletração fica indisponível.'),
};

/**
 * O AVATAR QUE SOLETRA (M4b): mostra um avatar 3D soletrando `texto` com as mãos, o alfabeto manual de Libras ou
 * de ASL. Ainda NÃO é montado em tela nenhuma do app: a ligação ao Intérprete é um passo posterior, e só pode
 * montar com as flags `avatar_3d` e `avatar_sinais` ligadas (`sinaisHabilitados`).
 *
 * Mostra SEMPRE os dois avisos fixos, a palavra atual destacada (não só por cor) e a legenda em texto. É imagem:
 * sem foco e sem controle (os controles são de quem monta). `aria-live` desligado por padrão.
 * SOLETRAÇÃO, não tradução; poses de demonstração NÃO revisadas por pessoas surdas.
 */
export default function AvatarSinalizante({
  texto,
  alfabeto,
  receita,
  tier,
  fonte,
  velocidade = 1,
  espelhar = false,
  camera = 'corpo',
  altoContraste = false,
  tamanho = 320,
  repetir = 0,
  pausado = false,
  tetoMs,
  soNomesProprios = false,
  anunciar = false,
  aoPalavra,
  aoFim,
  aoNaoSuportar,
  aoErro,
  aoPronto,
}: AvatarSinalizanteProps) {
  const raiz = useRef<HTMLElement>(null);
  const avisos = useRef<HTMLDivElement>(null);
  const [dados, setDados] = useState<DadosDeSinais | null>(null);
  const [sessao, setSessao] = useState<SessaoDeAvatar | null>(null);
  const [semSinais, setSemSinais] = useState<MotivoSemSinais | null>(null);
  const [largura, setLargura] = useState(0);
  const [atual, setAtual] = useState<{ palavra: number; letra: string; mov: boolean }>({
    palavra: -1,
    letra: '',
    mov: false,
  });
  const reduzido = useMemo(() => movimentoReduzido(), []);
  const aoErroRef = useRef(aoErro);
  aoErroRef.current = aoErro;
  const cbs = useRef({ aoPalavra, aoFim, aoNaoSuportar, aoPronto });
  cbs.current = { aoPalavra, aoFim, aoNaoSuportar, aoPronto };

  // avisos fixos: montados à mão e recolocados se alguém os remover ou editar
  useEffect(() => {
    const caixa = avisos.current;
    const host = raiz.current;
    if (!caixa || !host) return;
    preencherAvisos(caixa);
    let ocupado = false;
    const obs: MutationObserver = new MutationObserver(() => garantir());
    const garantir = () => {
      if (ocupado) return;
      ocupado = true;
      try {
        if (!host.contains(caixa)) host.prepend(caixa);
        preencherAvisos(caixa);
      } finally {
        ocupado = false;
        obs.takeRecords(); // descarta o que nós mesmos acabamos de escrever
      }
    };
    obs.observe(caixa, { childList: true, subtree: true, characterData: true, attributes: true });
    obs.observe(host, { childList: true });
    return () => obs.disconnect();
  }, []);

  // largura disponível
  useEffect(() => {
    const host = raiz.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setLargura(host.clientWidth));
    ro.observe(host);
    setLargura(host.clientWidth);
    return () => ro.disconnect();
  }, []);

  // dados do alfabeto (chunk dinâmico; nada de fetch)
  useEffect(() => {
    let vivo = true;
    setDados(null);
    carregarSinais(alfabeto).then(
      (d) => vivo && setDados(d),
      () => vivo && aoErroRef.current?.('dados'),
    );
    return () => {
      vivo = false;
    };
  }, [alfabeto]);

  const sequencia = useMemo<Sequencia | null>(
    () =>
      dados
        ? soletrar(texto, dados.alfabeto, {
            limites: dados.limites,
            velocidade,
            espelhar,
            tetoMs,
            soNomesProprios,
          })
        : null,
    [dados, texto, velocidade, espelhar, tetoMs, soNomesProprios],
  );
  const seqRef = useRef<Sequencia | null>(null);
  seqRef.current = sequencia;

  // controle dos ossos (lib carregada junto do motor, por import dinâmico)
  const controle = useRef<ControleDeMaos | null>(null);
  const [controlePronto, setControlePronto] = useState(0);
  useEffect(() => {
    controle.current = null;
    setSemSinais(null);
    if (!sessao || !dados) return;
    let vivo = true;
    void import('../../lib/avatar/maos').then((m) => {
      if (!vivo) return;
      const av = { objeto: sessao.avatar.objeto, vrm: sessao.avatar.vrm };
      const suporte = m.suportaSinais(av);
      if (suporte.suporta === false) {
        const motivo = (suporte as { motivo: MotivoSemSinais }).motivo;
        setSemSinais(motivo);
        cbs.current.aoNaoSuportar?.(motivo);
        return;
      }
      controle.current = m.criarMaos(av, dados.limites);
      setControlePronto((n) => n + 1);
    });
    return () => {
      vivo = false;
      controle.current?.restaurar();
      controle.current = null;
    };
  }, [sessao, dados]);

  // câmera: corpo (busto) ou só as mãos (cabeça escondida)
  useEffect(() => {
    const ctl = controle.current;
    if (!sessao || !ctl) return;
    let vivo = true;
    void import('../../lib/avatar/maos').then((m) => {
      if (!vivo) return;
      const av = { objeto: sessao.avatar.objeto, vrm: sessao.avatar.vrm };
      if (camera === 'maos') {
        m.ocultarCabeca(av, true);
        sessao.motor.definirEnquadramento(m.enquadramentoDasMaos(ctl));
      } else {
        m.ocultarCabeca(av, false);
        sessao.motor.definirEnquadramento(null);
      }
    });
    return () => {
      vivo = false;
    };
  }, [sessao, camera, controlePronto]);

  // reprodução: relógio, gancho dos ossos e atualização da legenda
  const inicio = useRef<number | null>(null);
  useEffect(() => {
    const seq = sequencia;
    const ctl = controle.current;
    if (!sessao || !seq) return;
    const motor = sessao.motor;
    inicio.current = pausado ? null : performance.now();
    let terminou = !seq.passos.length;
    let ultima = { palavra: -2, passo: -2, pose: null as unknown };
    if (ctl) {
      motor.definirGanchoDosOssos(() => {
        const ms = inicio.current === null ? 0 : performance.now() - inicio.current;
        ctl.aplicar(amostrar(seq, ms, { reduzido }).pose, seq.repouso);
      });
    }
    const tick = () => {
      const ms = inicio.current === null ? 0 : performance.now() - inicio.current;
      const am = amostrar(seq, ms, { reduzido });
      if (am.palavra !== ultima.palavra || am.passo !== ultima.passo) {
        const p = am.passo >= 0 && am.palavra >= 0 ? seq.passos[am.passo] : null;
        setAtual({ palavra: am.palavra, letra: p?.letra ?? '', mov: p?.movimento ?? false });
        if (am.palavra !== ultima.palavra && am.palavra >= 0) cbs.current.aoPalavra?.(am.palavra);
      }
      // movimento reduzido: o laço só desenha quando algo muda; pede quadro na troca de pose
      if (reduzido && (am.palavra !== ultima.palavra || am.passo !== ultima.passo || am.pose !== ultima.pose))
        motor.invalidar();
      ultima = { palavra: am.palavra, passo: am.passo, pose: am.pose };
      if (!terminou && inicio.current !== null && ms >= seq.duracaoMs) {
        terminou = true;
        setAtual({ palavra: -1, letra: '', mov: false });
        cbs.current.aoFim?.();
        motor.invalidar();
      }
    };
    tick();
    const id = window.setInterval(tick, 60);
    return () => {
      window.clearInterval(id);
      motor.definirGanchoDosOssos(null);
    };
    // `repetir` reinicia; `controlePronto` religa o gancho quando o controle fica pronto
  }, [sessao, sequencia, repetir, pausado, reduzido, controlePronto]);

  // avisa quem monta quando tudo está pronto
  useEffect(() => {
    if (sessao && controle.current && sequencia)
      cbs.current.aoPronto?.({ sessao, controle: controle.current, sequencia });
  }, [sessao, sequencia, controlePronto]);

  const aoSessao = useCallback((s: SessaoDeAvatar | null) => setSessao(s), []);

  const pele = corDaPaleta('pele', receita.paleta.pele)?.hex ?? null;
  const contraste = altoContraste ? fundoDeAltoContraste(pele) : null;
  const lado = Math.max(120, Math.min(tamanho, largura || tamanho));
  const palavras = sequencia?.palavras ?? null;
  const estado = !sequencia ? 'carregando' : semSinais ? 'indisponivel' : atual.palavra >= 0 ? 'soletrando' : 'parado';

  const caixaDoAvatar: CSSProperties = {
    display: 'grid',
    placeItems: 'center',
    background: contraste ? contraste.fundo : 'rgba(127,127,127,0.12)',
    padding: 4,
  };
  const claro = contraste?.fundo === '#f7f6f0';

  return (
    <section
      ref={raiz}
      aria-label={t('Avatar soletrando com as mãos')}
      data-sinais-estado={estado}
      data-sinais-pronto={Boolean(sequencia && controle.current && !semSinais)}
      data-sinais-suporte={semSinais ? `nao:${semSinais}` : 'sim'}
      data-sinais-camera={camera}
      data-sinais-contraste={contraste ? contraste.razao.toFixed(2) : undefined}
      style={{ width: '100%', maxWidth: tamanho + 8, position: 'relative' }}
    >
      <div ref={avisos} />
      <div style={caixaDoAvatar} data-sinais-palco>
        <AvatarCanvas
          receita={receita}
          estado="parado"
          emocao="neutro"
          tier={tier}
          tamanho={lado}
          fonte={fonte}
          aoErro={(m) => aoErroRef.current?.(m)}
          aoSessao={aoSessao}
        />
      </div>
      {semSinais && (
        <p role="status" data-sinais-indisponivel style={{ margin: '6px 0', fontSize: 13 }}>
          {MOTIVO_SEM_SINAIS[semSinais]()}
        </p>
      )}
      <div
        data-sinais-letra-atual
        aria-hidden="true"
        style={{ minHeight: 40, display: 'flex', alignItems: 'baseline', gap: 10, padding: '4px 0' }}
      >
        <strong style={{ fontSize: 32, lineHeight: 1 }}>{atual.letra}</strong>
        {atual.mov && <small>{t('letra com movimento: aproximada')}</small>}
      </div>
      <p
        data-sinais-legenda
        aria-live={anunciar ? 'polite' : 'off'}
        aria-label={t('Legenda')}
        style={{ margin: 0, fontSize: 18, lineHeight: 1.5, wordBreak: 'break-word' }}
      >
        {palavras && palavras.length
          ? palavras.map((p, i) => {
              const ativa = p.indice === atual.palavra;
              const motivo = p.estado === 'nao_soletrada' && p.motivo ? MOTIVO_DA_PALAVRA[p.motivo]() : undefined;
              return (
                <span key={`${p.indice}-${p.texto}`}>
                  {i > 0 ? ' ' : ''}
                  <span
                    data-palavra={p.indice}
                    data-palavra-estado={p.estado}
                    data-palavra-atual={ativa || undefined}
                    aria-current={ativa ? 'true' : undefined}
                    title={motivo}
                    style={{
                      padding: '0 3px',
                      borderRadius: 4,
                      fontWeight: ativa ? 800 : 400,
                      textDecoration: ativa ? 'underline' : p.estado === 'nao_soletrada' ? 'underline dotted' : 'none',
                      textUnderlineOffset: 3,
                      background: ativa ? (claro ? '#ffd23f' : '#6fd3a8') : 'transparent',
                      color: ativa ? '#101010' : 'inherit',
                      outline: ativa ? '2px solid currentColor' : 'none',
                    }}
                  >
                    {p.texto}
                  </span>
                </span>
              );
            })
          : texto}
      </p>
    </section>
  );
}
