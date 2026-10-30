/**
 * O VLIBRAS NO APP (piloto só para adultos; `docs/pesquisa/2026-10-29-vlibras-piloto.md`). Aqui moram o ACEITE guardado no
 * aparelho e a PONTE: o widget do governo federal NUNCA roda no documento do app, e sim numa página dedicada
 * (`/vlibras-ponte.html`) dentro de um `<iframe sandbox="allow-scripts">` SEM `allow-same-origin`. A origem do iframe é
 * opaca: o script do governo não enxerga o DOM, os cookies nem o `localStorage` do Frasy. A conversa é por `postMessage`
 * com esquema estrito (`core/libras/vlibras`). O `script-src` do app continua `'self'`.
 *
 * REGRA DE OURO: o iframe da ponte só é criado, e só recebe `iniciar`/`texto`, depois do portão (flag ligada, perfil
 * adulto confirmado, aceite explícito). Sem idade conhecida = protegido = nada é criado. O aceite fica no `localStorage`
 * (sempre em `try/catch`) e é revogável.
 */
import { useSyncExternalStore } from 'react';

import {
  CAMINHO_DA_PONTE_DO_VLIBRAS,
  consentimentoValido,
  lerMensagemDaPonte,
  type MensagemParaAPonte,
  podeOferecerVLibras,
  portaoDoVLibras,
  SANDBOX_DA_PONTE_DO_VLIBRAS,
  type TipoDeMensagemDaPonte,
  VERSAO_DO_CONSENTIMENTO_DO_VLIBRAS,
} from '../../core/libras/vlibras';
import { FLAG_LIBRAS_VLIBRAS } from '../../core/planos';
import { protegidoParaAvatar } from '../avatar/protegido';
import { useFlag } from '../flags';
import { t } from '../i18n';

export const CHAVE_DO_CONSENTIMENTO_DO_VLIBRAS = 'frasy.vlibras.consentimento';

/* ------------------------------ o aceite guardado ------------------------------ */

const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
function assinar(f: () => void): () => void {
  ouvintes.add(f);
  const noStorage = (e: StorageEvent) => {
    if (e.key === CHAVE_DO_CONSENTIMENTO_DO_VLIBRAS || e.key === null) f();
  };
  window.addEventListener('storage', noStorage);
  return () => {
    ouvintes.delete(f);
    window.removeEventListener('storage', noStorage);
  };
}

/** A pessoa já aceitou (a versão atual do texto)? Armazenamento bloqueado = não aceitou. */
export function consentimentoDoVLibras(): boolean {
  try {
    return consentimentoValido(localStorage.getItem(CHAVE_DO_CONSENTIMENTO_DO_VLIBRAS));
  } catch {
    return false;
  }
}

/** Guarda o aceite. Devolve `false` se o aparelho não deixa guardar (sem aceite guardado, nada é criado). */
export function aceitarVLibras(agora = Date.now()): boolean {
  try {
    localStorage.setItem(
      CHAVE_DO_CONSENTIMENTO_DO_VLIBRAS,
      JSON.stringify({ v: VERSAO_DO_CONSENTIMENTO_DO_VLIBRAS, aceitoEm: agora }),
    );
  } catch {
    return false;
  }
  avisar();
  return consentimentoDoVLibras();
}

/** Revoga o aceite. Quem tem a ponte aberta a fecha ao ver `aceitou` virar falso (o widget vive só dentro do iframe). */
export function revogarVLibras(): void {
  try {
    localStorage.removeItem(CHAVE_DO_CONSENTIMENTO_DO_VLIBRAS);
  } catch {
    /* sem armazenamento: o aceite já não vale na próxima leitura */
  }
  avisar();
}

/* ------------------------------ a ponte ------------------------------ */

/** O portão agora: flag (de quem chama), perfil e aceite são lidos na hora, para nenhum chamador pulá-lo. */
export function podeUsarAPonte(flag: boolean): boolean {
  return portaoDoVLibras({ flag, protegido: protegidoParaAvatar(), consentimento: consentimentoDoVLibras() }).ok;
}

/**
 * O iframe da ponte, ou `null` se o portão não deixa. `sandbox="allow-scripts"` e NADA mais (nunca `allow-same-origin`):
 * origem opaca. Sem referrer e sem permissão de recurso do navegador nenhuma.
 */
export function criarPonteDoVLibras(flag: boolean): HTMLIFrameElement | null {
  if (typeof document === 'undefined' || !podeUsarAPonte(flag)) return null;
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', SANDBOX_DA_PONTE_DO_VLIBRAS);
  f.setAttribute('referrerpolicy', 'no-referrer');
  f.setAttribute('allow', '');
  f.title = t('Sinais de apoio via VLibras (serviço do governo federal)');
  f.src = CAMINHO_DA_PONTE_DO_VLIBRAS;
  return f;
}

/**
 * Manda uma mensagem à ponte (o portão é conferido a CADA envio). O destino é origem opaca: o navegador só aceita
 * `targetOrigin '*'` aqui, e por isso a mensagem leva só `iniciar` ou um trecho que a pessoa escolheu enviar.
 */
export function enviarParaAPonte(
  ponte: HTMLIFrameElement | null,
  flag: boolean,
  mensagem: MensagemParaAPonte,
): boolean {
  const alvo = ponte?.contentWindow;
  if (!alvo || !podeUsarAPonte(flag)) return false;
  alvo.postMessage(mensagem, '*');
  return true;
}

/** Escuta a ponte: só vale mensagem cujo `source` é o iframe e cujo corpo cumpre o esquema estrito. */
export function ouvirAPonte(ponte: HTMLIFrameElement, aoReceber: (tipo: TipoDeMensagemDaPonte) => void): () => void {
  const f = (e: MessageEvent) => {
    if (!ponte.contentWindow || e.source !== ponte.contentWindow) return;
    const tipo = lerMensagemDaPonte(e.data);
    if (tipo) aoReceber(tipo);
  };
  window.addEventListener('message', f);
  return () => window.removeEventListener('message', f);
}

/* ------------------------------ o gancho das telas ------------------------------ */

export interface ControleDoVLibras {
  /** O botão pode aparecer (flag ligada e adulto confirmado)? Falso: nada do VLibras existe na tela. */
  disponivel: boolean;
  /** A flag remota, para repassar ao portão da ponte. */
  flag: boolean;
  /** A pessoa já aceitou. */
  aceitou: boolean;
  aceitar: () => boolean;
  revogar: () => void;
}

/** O evento que `protecaoDoMenor` dispara quando o servidor diz a idade (o mesmo de `aoMudarProtecao`). */
const EVENTO_DA_PROTECAO = 'babel_protecao_changed';
function assinarProtecao(f: () => void): () => void {
  window.addEventListener(EVENTO_DA_PROTECAO, f);
  return () => window.removeEventListener(EVENTO_DA_PROTECAO, f);
}

export function useVLibras(): ControleDoVLibras {
  const flag = useFlag(FLAG_LIBRAS_VLIBRAS);
  // Em dúvida, protegido (falha fechada), também no primeiro desenho do servidor.
  const protegido = useSyncExternalStore(assinarProtecao, protegidoParaAvatar, () => true);
  const aceitou = useSyncExternalStore(assinar, consentimentoDoVLibras, () => false);
  return {
    disponivel: podeOferecerVLibras({ flag, protegido }),
    flag,
    aceitou,
    aceitar: () => aceitarVLibras(),
    revogar: revogarVLibras,
  };
}
