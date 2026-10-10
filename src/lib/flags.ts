/**
 * FEATURE FLAGS NO CLIENTE (Fase 6b) — um CACHE de `GET /api/flags`, e o jeito de a tela perguntar.
 *
 *   const ligada = useFlag('modo_convidado');
 *   const ofertas = useConfigRemota('oferta_planos', OFERTAS_PADRAO, ehConfigDeOfertas);
 *
 * QUEM DECIDE É O SERVIDOR (`server/lib/flags.ts`): ele avalia as regras e manda só o resultado
 * (`ligada` + `payload`). O cliente não vê regra nenhuma e não avalia nada.
 *
 * TRÊS CAMADAS, para funcionar offline e no primeiro paint:
 *   1. memória (o estado deste módulo);
 *   2. `localStorage['babel.flags']` — o ÚLTIMO VALOR CONHECIDO, lido de forma síncrona na primeira
 *      pergunta, antes de qualquer rede: a tela não pisca de "desligado" para "ligado" ao abrir;
 *   3. a rede, ao primeiro uso, ao focar a aba (no máximo uma vez a cada 30 s), a cada 5 minutos,
 *      e quando a identidade ou o idioma mudam (o resultado depende dos dois).
 * Falha de rede ou resposta fora da forma NÃO muda nada: mantém o último valor conhecido.
 *
 * FALLBACK SEGURO: flag ausente = desligada; payload ausente, desligado ou fora da forma = o padrão
 * embutido no código, que quem chama passa. Uma flag nunca é guarda de segurança nem de cota — o
 * cliente pode mentir, e o servidor não confia nele para isso (`docs/flags.md`).
 *
 * NO MODO SEM CONTA o `apiFetch` desvia tudo para o servidor em memória, MENOS `/api/flags`
 * (`PASSAM_DIRETO` em `src/data/efemero/nucleo.ts`): as flags são públicas e o servidor em memória
 * não sabe o que o operador ligou. Na EDIÇÃO ESTÁTICA (`lib/edicaoEstatica`) nem isso: não há
 * servidor, e vale o cache/padrão embutido, sem pergunta e sem refresh.
 */
import { useEffect, useSyncExternalStore } from 'react';

import type { FlagsAvaliadas } from '../core/flags';
import type { ConfigDeOfertas } from '../core/ofertas';
import { apiFetch } from '../data/funil';
import { edicaoEstatica } from './edicaoEstatica';
import { CHAVE_DO_CACHE, definirEstadoDasFlags, flag, flagLigada, flagsAtuais, normalizar } from './flagsCache';
import { assinarIdioma, idiomaDaInterface } from './i18n';
import { aoMudarIdentidade } from './identidade';
import { VERSAO_DO_APP } from './versao';

const CHAVE_DA_INSTALACAO = 'babel.instalacao';
const EVENTO = 'babel_flags_changed';
/** Intervalo do refresh periódico. */
export const INTERVALO_DE_REFRESH_MS = 5 * 60_000;
/** Foco na aba não pergunta de novo antes disto (é o TTL do servidor). */
const INTERVALO_MIN_NO_FOCO_MS = 30_000;

// ───────────────────────────── id da instalação ─────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function novoUuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let instalacaoEmMemoria: string | null = null;

/**
 * O id ALEATÓRIO desta instalação — decide o balde do percentual para quem não tem conta, e é o
 * mesmo enquanto o `localStorage` existir. Não identifica a pessoa: nasce aqui, sem nada dela.
 * Sem storage (modo privado bloqueado), vale só para esta aba.
 */
export function idDaInstalacao(): string {
  try {
    const salvo = localStorage.getItem(CHAVE_DA_INSTALACAO);
    if (salvo && UUID.test(salvo)) return salvo;
    const novo = novoUuid();
    localStorage.setItem(CHAVE_DA_INSTALACAO, novo);
    return novo;
  } catch {
    instalacaoEmMemoria ??= novoUuid();
    return instalacaoEmMemoria;
  }
}

// ───────────────────────────── cache ─────────────────────────────

/* O estado e a leitura síncrona moram numa FOLHA (`./flagsCache`), para quem está abaixo do funil
   (`lib/convidado`, que `data/funil` importa) ler flags sem ciclo de importação. */
export { flagLigada, flagsAtuais };

function avisar(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO));
}

let ultimaLeitura = 0;
let emVoo: Promise<FlagsAvaliadas> | null = null;

/**
 * Pergunta ao servidor e atualiza o cache. Nunca lança; falha mantém o último valor conhecido.
 * Chamadas simultâneas compartilham a mesma requisição.
 */
export function carregarFlags(): Promise<FlagsAvaliadas> {
  // Edição estática: não há servidor que avalie regra nenhuma — vale o cache/padrão embutido.
  if (edicaoEstatica()) return Promise.resolve(flagsAtuais());
  if (emVoo) return emVoo;
  emVoo = (async () => {
    try {
      const headers: Record<string, string> = {
        'x-babel-instalacao': idDaInstalacao(),
        'x-babel-idioma': idiomaDaInterface(),
      };
      if (VERSAO_DO_APP) headers['x-babel-versao'] = VERSAO_DO_APP;
      const res = await apiFetch('/api/flags', { headers, timeoutMs: 10_000 });
      if (!res.ok) return flagsAtuais();
      const novas = normalizar(await res.json());
      if (!novas) return flagsAtuais();
      ultimaLeitura = Date.now();
      const mudou = JSON.stringify(novas) !== JSON.stringify(flagsAtuais());
      definirEstadoDasFlags(novas);
      try {
        localStorage.setItem(CHAVE_DO_CACHE, JSON.stringify(novas));
      } catch {
        /* espelho é best-effort */
      }
      if (mudou) avisar();
      return novas;
    } catch {
      return flagsAtuais();
    } finally {
      emVoo = null;
    }
  })();
  return emVoo;
}

/** Esquece tudo (testes, ou uma troca de conta que não deve herdar o resultado da anterior). */
export function limparFlags(): void {
  definirEstadoDasFlags(null);
  ultimaLeitura = 0;
  try {
    localStorage.removeItem(CHAVE_DO_CACHE);
  } catch {
    /* idem */
  }
  avisar();
}

// ───────────────────────────── leitura ─────────────────────────────

/**
 * O payload de uma flag LIGADA, se passar em `valido`; senão, o `padrao` embutido. `padrao` deve
 * ser uma referência estável (constante de módulo) — ele volta como está.
 */
export function configRemota<T>(chave: string, padrao: T, valido?: (v: unknown) => v is T): T {
  const f = flag(chave);
  if (!f?.ligada || f.payload === undefined || f.payload === null) return padrao;
  if (valido && !valido(f.payload)) return padrao;
  return f.payload as T;
}

/**
 * Checagem LEVE do payload de ofertas: a validação completa é o zod do servidor, que já descartou
 * o que estava fora da forma. Aqui só se garante que a tela não quebra com um cache antigo.
 */
export function ehConfigDeOfertas(v: unknown): v is ConfigDeOfertas {
  if (!v || typeof v !== 'object') return false;
  const g = (v as { gatilhos?: unknown }).gatilhos;
  return (
    Array.isArray(g) && g.every((x) => !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string')
  );
}

// ───────────────────────────── atualização automática ─────────────────────────────

let iniciada = false;

/**
 * Liga o refresh (primeira leitura, foco, intervalo, identidade, idioma). Idempotente; os hooks
 * chamam sozinhos. Devolve como desligar (só testes precisam).
 */
export function iniciarAtualizacaoDeFlags(): () => void {
  if (iniciada || typeof window === 'undefined' || edicaoEstatica()) return () => {};
  iniciada = true;
  void carregarFlags();
  const aoFocar = () => {
    if (document.visibilityState === 'visible' && Date.now() - ultimaLeitura >= INTERVALO_MIN_NO_FOCO_MS) {
      void carregarFlags();
    }
  };
  document.addEventListener('visibilitychange', aoFocar);
  window.addEventListener('focus', aoFocar);
  /* ABA OCULTA NÃO SONDA (auditoria do servidor de 10/10/2026, achado A4): a aba esquecida em segundo
     plano pedia as flags a cada 5 minutos para ninguém ver, e no modo público cada pedido é uma escrita
     no limitador de taxa do servidor. Ao voltar a ficar visível, `aoFocar` (acima) lê na hora se a
     última leitura tem mais de 30 s, que é sempre o caso de quem pulou uma sondagem. */
  const intervalo = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    void carregarFlags();
  }, INTERVALO_DE_REFRESH_MS);
  const semIdentidade = aoMudarIdentidade(() => void carregarFlags());
  const semIdioma = assinarIdioma(() => void carregarFlags());
  return () => {
    iniciada = false;
    document.removeEventListener('visibilitychange', aoFocar);
    window.removeEventListener('focus', aoFocar);
    window.clearInterval(intervalo);
    semIdentidade();
    semIdioma();
  };
}

function assinar(cb: () => void): () => void {
  window.addEventListener(EVENTO, cb);
  return () => window.removeEventListener(EVENTO, cb);
}

/** `true` quando a flag está ligada para esta pessoa. Re-renderiza quando o servidor muda. */
export function useFlag(chave: string): boolean {
  useEffect(() => {
    iniciarAtualizacaoDeFlags();
  }, []);
  return useSyncExternalStore(
    assinar,
    () => flagLigada(chave),
    () => false,
  );
}

/** O payload da flag (ligada e válido) ou o `padrao` embutido. `padrao` deve ser estável. */
export function useConfigRemota<T>(chave: string, padrao: T, valido?: (v: unknown) => v is T): T {
  useEffect(() => {
    iniciarAtualizacaoDeFlags();
  }, []);
  return useSyncExternalStore(
    assinar,
    () => configRemota(chave, padrao, valido),
    () => padrao,
  );
}
