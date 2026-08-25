/**
 * IDIOMA DOMINANTE DA CONVERSA — resolve o "traduzir a MINHA fala para quem?" no modo
 * multi-idioma. Numa conversa fixa, a sua fala vira o idioma configurado dos outros. Mas
 * com detecção automática num lobby misto não existe "o idioma do outro": este rastreador
 * observa o idioma REAL detectado das últimas falas do sistema e responde com a moda —
 * é para essa língua que a sua fala é vertida (empate → a mais recente vence, porque a
 * conversa provavelmente acabou de mudar de língua).
 */
export class DominantLangTracker {
  private window: string[] = [];

  constructor(private readonly size = 8) {}

  /** Registra o idioma detectado de uma fala dos OUTROS (ignora vazio/desconhecido). */
  push(lang: string): void {
    const l = (lang || '').trim().toLowerCase();
    if (!l) return;
    this.window.push(l);
    if (this.window.length > this.size) this.window.shift();
  }

  /** Moda da janela ('' quando ainda não ouvimos ninguém). */
  dominant(): string {
    if (!this.window.length) return '';
    const counts = new Map<string, number>();
    for (const l of this.window) counts.set(l, (counts.get(l) ?? 0) + 1);
    let best = '';
    let bestCount = 0;
    // Percorre da fala mais ANTIGA para a mais recente; `>=` faz o empate cair na mais recente.
    for (const l of this.window) {
      const c = counts.get(l)!;
      if (c >= bestCount) {
        best = l;
        bestCount = c;
      }
    }
    return best;
  }

  reset(): void {
    this.window = [];
  }
}
