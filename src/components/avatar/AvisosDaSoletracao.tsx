import { type CSSProperties, type RefObject, useEffect, useRef } from 'react';

import { t } from '../../lib/i18n';

/**
 * AVISOS FIXOS e NÃO REMOVÍVEIS. São montados à mão no DOM (não pelo React) e um `MutationObserver` os recoloca se
 * alguém os tirar, esconder ou editar. Textos obrigatórios do produto (nenhum botão fecha, nada os esconde).
 */
export function avisosFixos(): Array<{ id: string; texto: string; estilo: string }> {
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
const ESTILO_DO_AVISO_COMPACTO = 'display:block;padding:3px 8px;font-weight:700;font-size:11px;line-height:1.25;';

/** O `style` que NÓS gravamos em cada nó (normalizado pelo navegador): qualquer outra coisa é adulteração. */
const ESTILO_GRAVADO = new WeakMap<Element, string>();

function defineSe(el: Element, atributo: string, valor: string): void {
  if (el.getAttribute(atributo) !== valor) el.setAttribute(atributo, valor);
}

/** Idempotente: só escreve no DOM o que mudou (não dispara o próprio observador em laço). */
function preencherAvisos(caixa: HTMLElement, compacto: boolean): void {
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
      el.setAttribute('style', `margin:0;${compacto ? ESTILO_DO_AVISO_COMPACTO : ESTILO_DO_AVISO}${a.estilo};`);
      ESTILO_GRAVADO.set(el, el.getAttribute('style') ?? '');
      el.textContent = a.texto;
      return el;
    }),
  );
}

/**
 * Liga os avisos fixos: `caixa` recebe os dois avisos e `host` é onde ela mora. Se alguém tirar a caixa de dentro do
 * `host`, esconder, editar ou apagar um aviso, o observador recoloca tudo.
 */
export function useAvisosFixos(
  caixaRef: RefObject<HTMLElement | null>,
  hostRef: RefObject<HTMLElement | null>,
  compacto = false,
): void {
  useEffect(() => {
    const caixa = caixaRef.current;
    const host = hostRef.current;
    if (!caixa || !host) return;
    preencherAvisos(caixa, compacto);
    let ocupado = false;
    const obs: MutationObserver = new MutationObserver(() => garantir());
    const garantir = () => {
      if (ocupado) return;
      ocupado = true;
      try {
        if (!host.contains(caixa)) host.prepend(caixa);
        preencherAvisos(caixa, compacto);
      } finally {
        ocupado = false;
        obs.takeRecords(); // descarta o que nós mesmos acabamos de escrever
      }
    };
    obs.observe(caixa, { childList: true, subtree: true, characterData: true, attributes: true });
    obs.observe(host, { childList: true });
    return () => obs.disconnect();
  }, [caixaRef, hostRef, compacto]);
}

/**
 * Os DOIS AVISOS FIXOS da soletração, para quem os mostra FORA do `AvatarSinalizante` (o painel e o avatar da conversa
 * mostram os avisos sempre que a soletração está ligada, mesmo sem soletrar nada no momento).
 */
export default function AvisosDaSoletracao({
  compacto = false,
  estilo,
}: {
  compacto?: boolean;
  estilo?: CSSProperties;
}) {
  const host = useRef<HTMLDivElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  useAvisosFixos(caixa, host, compacto);
  return (
    <div ref={host} style={estilo} data-avisos-da-soletracao>
      <div ref={caixa} />
    </div>
  );
}
