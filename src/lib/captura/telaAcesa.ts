/**
 * MANTER A TELA ACESA ENQUANTO GRAVA (a captura no celular, 2026-09-29).
 *
 * No celular, a tela que apaga sozinha suspende a aba — e com ela o microfone: a pessoa deixa o
 * celular na mesa ouvindo a aula e, 30 s depois, a legenda para. A Screen Wake Lock API
 * (`navigator.wakeLock.request('screen')`) segura a tela acesa enquanto a gravação corre.
 *
 * O navegador SOLTA a trava quando a aba some (troca de app, tela bloqueada no botão), então ela é
 * pedida de novo quando a aba volta a ficar visível. Sem a API (Firefox antigo, iOS < 16.4) ou com
 * o pedido recusado (economia de bateria), nada quebra: a tela só apaga como antes.
 *
 * A PREFERÊNCIA é por aparelho (é sobre ESTE celular, não sobre a conta): `localStorage`, ligada de
 * fábrica, e o acesso é protegido — navegação privada pode recusar o armazenamento.
 */
import { useEffect, useState } from 'react';

const CHAVE = 'babel.captura.telaAcesa';

type Trava = { release(): Promise<void>; released?: boolean };
type ComWakeLock = { wakeLock?: { request(tipo: 'screen'): Promise<Trava> } };

export function telaAcesaSuportada(escopo: unknown = globalThis): boolean {
  const n = (escopo as { navigator?: ComWakeLock }).navigator;
  return typeof n?.wakeLock?.request === 'function';
}

export function lerPreferenciaDeTelaAcesa(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== '0';
  } catch {
    return true;
  }
}

function gravarPreferenciaDeTelaAcesa(ligada: boolean): void {
  try {
    localStorage.setItem(CHAVE, ligada ? '1' : '0');
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

/** A preferência "Manter a tela acesa", com o setter que a guarda. */
export function usePreferenciaDeTelaAcesa(): [boolean, (ligada: boolean) => void] {
  const [ligada, setLigada] = useState(lerPreferenciaDeTelaAcesa);
  return [
    ligada,
    (v: boolean) => {
      gravarPreferenciaDeTelaAcesa(v);
      setLigada(v);
    },
  ];
}

/**
 * Segura a tela acesa enquanto `ativo`. Solta ao desligar/desmontar; pede de novo quando a aba volta.
 * `escopo` só existe para o teste.
 */
export function useTelaAcesa(ativo: boolean, escopo: typeof globalThis = globalThis): void {
  useEffect(() => {
    if (!ativo || !telaAcesaSuportada(escopo)) return;
    const n = escopo.navigator as unknown as Required<ComWakeLock>;
    const doc = (escopo as { document?: Document }).document;
    let trava: Trava | null = null;
    let vivo = true;
    const pedir = () => {
      if (trava && !trava.released) return;
      n.wakeLock.request('screen').then(
        (t) => {
          if (vivo) trava = t;
          else void t.release().catch(() => undefined);
        },
        () => undefined, // recusado (bateria, aba oculta): a tela só apaga como antes
      );
    };
    const aoVoltar = () => {
      if (doc?.visibilityState === 'visible') pedir();
    };
    pedir();
    doc?.addEventListener('visibilitychange', aoVoltar);
    return () => {
      vivo = false;
      doc?.removeEventListener('visibilitychange', aoVoltar);
      void trava?.release().catch(() => undefined);
    };
  }, [ativo, escopo]);
}
