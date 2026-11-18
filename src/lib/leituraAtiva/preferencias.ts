/**
 * O QUE A LEITURA ATIVA LEMBRA NO APARELHO (design §6): os textos lidos, o modo preferido e se o aviso do microfone
 * já foi visto por um adulto. Só isso: nada de áudio nem de transcrição. Toda leitura e escrita passa por
 * `try/catch` (janela privada, armazenamento bloqueado): sem armazenamento, a tela funciona sem lembrar.
 */
export type ModoDeLeitura = 'ouvir' | 'vozAlta' | 'silencio';

const CHAVE_LIDOS = 'frasy.leituraAtiva.lidos';
const CHAVE_MODO = 'frasy.leituraAtiva.modo';
const CHAVE_AVISO = 'frasy.leituraAtiva.avisoDoMicrofone';

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

export function textosLidos(): Set<string> {
  try {
    const v: unknown = JSON.parse(ler(CHAVE_LIDOS) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function marcarLido(id: string): Set<string> {
  const lidos = textosLidos();
  lidos.add(id);
  gravar(CHAVE_LIDOS, JSON.stringify([...lidos]));
  return lidos;
}

export function modoPreferido(): ModoDeLeitura {
  const m = ler(CHAVE_MODO);
  return m === 'vozAlta' || m === 'silencio' ? m : 'ouvir';
}

export function lembrarModo(m: ModoDeLeitura): void {
  gravar(CHAVE_MODO, m);
}

/** O adulto já viu o aviso do microfone (no perfil protegido ele aparece a cada sessão, e isto não vale). */
export function avisoDoMicrofoneVisto(): boolean {
  return ler(CHAVE_AVISO) === '1';
}

export function marcarAvisoDoMicrofoneVisto(): void {
  gravar(CHAVE_AVISO, '1');
}
