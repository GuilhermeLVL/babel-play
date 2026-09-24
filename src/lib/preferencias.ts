import { useEffect, useState } from 'react';

import { fetchSettings, patchUiSettings } from '../data/api';

/**
 * PREFERÊNCIAS DO USUÁRIO que não são aparência — avisos, consentimentos, meta diária, nível por
 * idioma e o formato da cópia dos dados (Ajustes → Notificações/Privacidade, Perfil → Você).
 *
 * ONDE MORAM: no blob `settings.ui`, chave `preferencias`, pelo MESMO caminho que idioma, meta de
 * comunicação e onboarding já usam (`patchUiSettings` → `PUT /api/settings`). Com conta, isso é o
 * servidor, por usuário; sem conta, o funil manda para o armazenamento local (`data/efemero`). Um
 * espelho no `localStorage` só serve para a primeira pintura não piscar os padrões.
 *
 * STORE DE MÓDULO, como `usePerfil`: o sino, o Perfil e os Ajustes leem o mesmo objeto, e salvar
 * numa tela atualiza as outras sem recarregar.
 */

export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export const NIVEIS_CEFR: Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const NOME_DO_NIVEL: Record<Cefr, string> = {
  A1: 'Iniciante',
  A2: 'Básico',
  B1: 'Intermediário',
  B2: 'Intermediário avançado',
  C1: 'Avançado',
  C2: 'Proficiente',
};

export type TipoDeAviso = 'revisao' | 'conquista' | 'fatura' | 'novidades';
export type Canal = 'app' | 'email' | 'push';
/**
 * `nuvem` (Fase 2 do lançamento): mandar fala e texto a servidores de IA — tradução, transcrição e
 * tutor (Groq, OpenRouter) e o tradutor público MyMemory. Desligado por padrão: o app é aberto a
 * menores, e sem o "sim" datado nada sai do aparelho (o gateway pula esses motores).
 */
export type Consentimento = 'metricas' | 'novidades' | 'ia' | 'nuvem';

export interface Preferencias {
  lembrete: { on: boolean; hora: string };
  avisos: Record<TipoDeAviso, Record<Canal, boolean>>;
  silencio: { on: boolean; de: string; ate: string };
  semanal: { on: boolean; dia: 'domingo' | 'segunda' };
  consentimentos: Record<Consentimento, boolean>;
  /** Cada mudança de consentimento, com data — "fica registrada, para você e para nós". */
  registroDeConsentimentos: Array<{ chave: Consentimento; valor: boolean; em: number }>;
  /** Meta diária em minutos (Perfil → Você). */
  metaMin: number;
  /** Autoavaliação por idioma (código base: `en`, `es`…). */
  niveis: Record<string, Cefr>;
  /** Formato da cópia dos dados (Ajustes → Privacidade). */
  formatoDaCopia: 'json' | 'csv';
}

/** Os padrões do protótipo aprovado (`E.notifPref`, `E.lembrete`, `E.cons`, `E.perfil`). */
export const PADRAO: Preferencias = {
  lembrete: { on: true, hora: '19:00' },
  avisos: {
    revisao: { app: true, email: false, push: true },
    conquista: { app: true, email: false, push: false },
    fatura: { app: true, email: true, push: false },
    novidades: { app: true, email: false, push: false },
  },
  silencio: { on: true, de: '22:00', ate: '08:00' },
  semanal: { on: true, dia: 'domingo' },
  consentimentos: { metricas: true, novidades: false, ia: false, nuvem: false },
  registroDeConsentimentos: [],
  metaMin: 15,
  niveis: {},
  formatoDaCopia: 'json',
};

const ESPELHO = 'babel.preferencias';
const CHAVE_NO_UI = 'preferencias';

/** Mescla o que veio (possivelmente parcial ou de uma versão antiga) sobre os padrões. */
export function normalizar(bruto: unknown): Preferencias {
  const p = (bruto && typeof bruto === 'object' ? bruto : {}) as Partial<Preferencias>;
  const avisos = { ...PADRAO.avisos };
  for (const k of Object.keys(avisos) as TipoDeAviso[]) avisos[k] = { ...PADRAO.avisos[k], ...(p.avisos?.[k] ?? {}) };
  return {
    lembrete: { ...PADRAO.lembrete, ...(p.lembrete ?? {}) },
    avisos,
    silencio: { ...PADRAO.silencio, ...(p.silencio ?? {}) },
    semanal: { ...PADRAO.semanal, ...(p.semanal ?? {}) },
    consentimentos: { ...PADRAO.consentimentos, ...(p.consentimentos ?? {}) },
    registroDeConsentimentos: Array.isArray(p.registroDeConsentimentos) ? p.registroDeConsentimentos.slice(-50) : [],
    metaMin: typeof p.metaMin === 'number' && p.metaMin > 0 ? p.metaMin : PADRAO.metaMin,
    niveis: p.niveis && typeof p.niveis === 'object' ? { ...p.niveis } : {},
    formatoDaCopia: p.formatoDaCopia === 'csv' ? 'csv' : 'json',
  };
}

function lerEspelho(): Preferencias {
  try {
    const s = localStorage.getItem(ESPELHO);
    return normalizar(s ? JSON.parse(s) : null);
  } catch {
    return normalizar(null);
  }
}

let atual: Preferencias = lerEspelho();
let carregou = false;
let carregando: Promise<void> | null = null;
const inscritos = new Set<(p: Preferencias) => void>();

function publicar(p: Preferencias) {
  atual = p;
  try {
    localStorage.setItem(ESPELHO, JSON.stringify(p));
  } catch {
    /* sem armazenamento: o servidor continua sendo a fonte */
  }
  for (const f of inscritos) f(p);
}

/** Lê do servidor (uma vez por carga do app). */
export function carregarPreferencias(): Promise<void> {
  if (carregou) return Promise.resolve();
  carregando ??= fetchSettings()
    .then((s) => {
      if (!s?.ui) return;
      try {
        const ui = JSON.parse(s.ui) as Record<string, unknown>;
        if (ui[CHAVE_NO_UI]) publicar(normalizar(ui[CHAVE_NO_UI]));
      } catch {
        /* ui inválido: ficam os padrões */
      }
    })
    .catch(() => undefined)
    .finally(() => {
      carregou = true;
      carregando = null;
    });
  return carregando;
}

export function lerPreferencias(): Preferencias {
  return atual;
}

/* As gravações vão em fila: `patchUiSettings` lê e reescreve o blob inteiro, e duas em paralelo
   fariam a segunda apagar a primeira. */
let fila: Promise<unknown> = Promise.resolve();

/**
 * Aplica a mudança na hora (otimista) e grava. Se o servidor recusar, VOLTA ao valor anterior e
 * devolve `false` — a tela diz que não salvou, em vez de mostrar um valor que o banco não tem.
 */
export function salvarPreferencias(mudar: (p: Preferencias) => Preferencias): Promise<boolean> {
  const antes = atual;
  const depois = normalizar(mudar(JSON.parse(JSON.stringify(atual)) as Preferencias));
  publicar(depois);
  const gravacao = fila.then(async () => {
    const ok = await patchUiSettings({ [CHAVE_NO_UI]: depois });
    if (!ok && atual === depois) publicar(antes);
    return !!ok;
  });
  fila = gravacao.catch(() => undefined);
  return gravacao.catch(() => false);
}

/** Registra uma mudança de consentimento com data (a nota da tela promete isso). */
export function mudarConsentimento(chave: Consentimento, valor: boolean): Promise<boolean> {
  return salvarPreferencias((p) => ({
    ...p,
    consentimentos: { ...p.consentimentos, [chave]: valor },
    registroDeConsentimentos: [...p.registroDeConsentimentos, { chave, valor, em: Date.now() }],
  }));
}

export function usePreferencias(): Preferencias {
  const [p, setP] = useState(atual);
  useEffect(() => {
    inscritos.add(setP);
    setP(atual);
    void carregarPreferencias();
    return () => {
      inscritos.delete(setP);
    };
  }, []);
  return p;
}

/** Só para testes: volta o módulo ao estado de fábrica. */
export function _reiniciarPreferencias(): void {
  atual = normalizar(null);
  carregou = false;
  carregando = null;
  fila = Promise.resolve();
}
