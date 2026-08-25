import { play, playGeneric, type SoundEvent } from './soundFx';

/**
 * Eventos que o delegado só DEDUZIU, sem o elemento ter declarado nada. Estes vão pelo caminho
 * agendado (`playGeneric`), para que o som da AÇÃO — disparado logo depois pelo handler do botão,
 * como `speak` em lib/tts ou `add` em data/api — possa cancelá-los. Ver soundFx para o porquê.
 */
const DEDUZIDOS = new Set<SoundEvent>(['click', 'nav', 'select']);

/**
 * SOM DELEGADO — um listener para toda a app.
 *
 * POR QUE NÃO FOI BOTÃO POR BOTÃO
 * ───────────────────────────────
 * A app tem 412 `<button>` e 34 `<select>` espalhados por mais de 40 arquivos. Escrever
 * `onClick={() => play('click')}` em cada um seria ~450 edições — e, o que é pior, **todo botão
 * novo nasceria mudo**. É exatamente o padrão que apodreceu os emojis e os rótulos por perfil nas
 * rodadas anteriores: a regra vivia espalhada, então envelhecia em lugares diferentes.
 *
 * Aqui a regra vive num lugar só. O listener escuta o `click` na fase de CAPTURA (para ouvir
 * mesmo quando um handler chama `stopPropagation`) e DEDUZ o som a partir da semântica que o
 * elemento já declara para a acessibilidade — `aria-pressed`, `aria-expanded`, `aria-current`,
 * `role`. Ou seja: quanto mais acessível o botão, mais certo ele soa. Não há atributo novo a
 * manter na maioria dos casos.
 *
 * Quando a dedução não basta, `data-sfx` decide:
 *   <button data-sfx="add">      → força o som de "guardei algo"
 *   <button data-sfx="none">     → silencia (o handler toca o som ele mesmo)
 */

/** Nome de evento válido? (protege contra um `data-sfx` escrito errado.) */
const EVENTOS = new Set<string>([
  'click', 'nav', 'open', 'close',
  'toggleOn', 'toggleOff', 'select',
  'add', 'remove', 'speak',
  'success', 'error', 'recordStart', 'recordStop', 'levelUp'
]);

/** O alvo clicado pode ser um `<svg>` dentro do botão — sobe até achar o que é acionável. */
function acionavel(alvo: EventTarget | null): HTMLElement | null {
  if (!(alvo instanceof Element)) return null;
  const el = alvo.closest<HTMLElement>(
    'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="option"], [data-sfx], input[type="checkbox"], input[type="radio"], label[for]'
  );
  return el ?? null;
}

/**
 * Deduz o som. A ORDEM importa: do mais específico (declarado à mão) para o mais genérico.
 */
function deduzir(el: HTMLElement): SoundEvent | null {
  // 1) Declaração explícita ganha de tudo — inclusive `none`.
  const explicito = el.closest<HTMLElement>('[data-sfx]')?.dataset.sfx;
  if (explicito) {
    if (explicito === 'none') return null;
    return EVENTOS.has(explicito) ? (explicito as SoundEvent) : null;
  }

  // 2) Desabilitado por ARIA ainda dispara `click` no DOM — não deve soar como ação bem-sucedida.
  if (el.getAttribute('aria-disabled') === 'true') return null;

  const tag = el.tagName;
  const role = el.getAttribute('role');

  // 3) Estado ligado/desligado. Lemos o valor ANTES do handler (estamos na captura), então o
  //    som anuncia o estado NOVO: quem está `false` agora vai ligar.
  if (tag === 'INPUT') {
    const input = el as HTMLInputElement;
    if (input.type === 'checkbox' || input.type === 'radio') {
      return input.checked ? 'toggleOff' : 'toggleOn';
    }
  }
  const pressed = el.getAttribute('aria-pressed');
  if (pressed === 'true') return 'toggleOff';
  if (pressed === 'false') return 'toggleOn';
  if (role === 'switch') {
    return el.getAttribute('aria-checked') === 'true' ? 'toggleOff' : 'toggleOn';
  }

  // 4) Abrir/fechar overlay.
  const expanded = el.getAttribute('aria-expanded');
  if (expanded === 'true') return 'close';
  if (expanded === 'false') return 'open';
  if (el.getAttribute('aria-haspopup')) return 'open';

  // 5) Navegação. `aria-current` marca o destino ATUAL; clicar em qualquer aba é navegar.
  if (role === 'tab' || el.hasAttribute('aria-current')) return 'nav';
  if (el.closest('nav')) return 'nav';

  // 6) Escolha dentro de uma lista.
  if (role === 'option' || el.closest('[role="listbox"], [role="menu"]')) return 'select';

  // 7) Genérico.
  if (tag === 'BUTTON' || tag === 'A' || role === 'button' || tag === 'LABEL') return 'click';
  return null;
}

let instalado = false;

/**
 * Instala o listener global. Idempotente — chamado uma vez, do App.
 *
 * Devolve a função de limpeza (usada pelo cleanup do efeito no React; em produção o listener
 * vive o tempo todo, mas em HMR isso evita empilhar listeners e tocar o som em dobro).
 */
export function installSfxDelegate(): () => void {
  if (instalado) return () => {};
  instalado = true;

  const onClick = (e: MouseEvent) => {
    // Só gesto real do usuário: `detail === 0` é clique sintético (`.click()` de código),
    // e som disparado por código costuma ser duplicata de um som que o handler já toca.
    if (!e.isTrusted) return;
    const el = acionavel(e.target);
    if (!el) return;
    const evento = deduzir(el);
    if (!evento) return;
    // Declarado via `data-sfx` = intencional, toca na hora. Deduzido = agendado, para o som da
    // acao poder vencer (ver DEDUZIDOS acima).
    const declarado = !!el.closest<HTMLElement>('[data-sfx]');
    if (declarado || !DEDUZIDOS.has(evento)) play(evento);
    else playGeneric(evento);
  };

  /** `<select>` não emite clique útil: o `change` é o momento em que a escolha existe. */
  const onChange = (e: Event) => {
    if (!e.isTrusted) return;
    const el = e.target;
    if (el instanceof HTMLSelectElement) {
      if (el.closest('[data-sfx="none"]')) return;
      playGeneric('select');
    }
  };

  document.addEventListener('click', onClick, true);
  document.addEventListener('change', onChange, true);

  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('change', onChange, true);
    instalado = false;
  };
}
