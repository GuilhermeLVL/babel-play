import { Home,RefreshCw } from 'lucide-react';
import React from 'react';

import { reportarErro } from '../lib/relatorioDeErros';

/**
 * A REDE DE PROTEÇÃO que faltava: sem um ErrorBoundary, qualquer exceção de render (ou um chunk
 * que não carregou) derrubava a árvore inteira e o React deixava a página PRETA, sem menu, sem
 * botão, sem explicação. Aqui a falha vira uma tela curta com as duas saídas que resolvem quase
 * tudo: recarregar (chunk novo depois de um deploy) ou voltar ao início.
 *
 * Nada de detalhe técnico para o usuário; o erro vai para o console, onde quem depura o acha.
 */
interface Estado { erro: Error | null; idDoErro: string | null }

export default class ErroDaTela extends React.Component<{ children: React.ReactNode }, Estado> {
  state: Estado = { erro: null, idDoErro: null };

  static getDerivedStateFromError(erro: Error): Partial<Estado> { return { erro }; }

  componentDidCatch(erro: Error, info: React.ErrorInfo): void {
    console.error('[babel] erro de render', erro, info.componentStack);
    /* E4 — o erro deixou de morrer no console: vai para o diário do servidor, e o ID volta para a
       TELA. É o que o usuário cita no suporte, e o que o dono procura em /api/admin/erros. */
    const id = reportarErro('render', erro.message, info.componentStack?.split('\n')[1]?.trim());
    this.setState({ idDoErro: id });
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-canvas p-6" role="alert">
        <div className="card-panel bg-surface max-w-md w-full p-6 text-center">
          <p className="label-mono mb-2">Algo deu errado</p>
          <h1 className="font-display font-black text-xl text-ink">Esta tela não conseguiu abrir</h1>
          <p className="text-[13px] text-ink-muted mt-2 leading-snug">
            Costuma ser uma versão nova do app chegando enquanto a antiga ainda estava aberta.
            Recarregar resolve na maioria das vezes; nada do que você gravou se perde.
          </p>
          {this.state.idDoErro && (
            <p className="text-[11px] text-ink-faint mt-2">
              Se precisar de ajuda, cite o código <code className="font-mono">{this.state.idDoErro}</code>.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
            <button onClick={() => window.location.reload()} className="btn-solid">
              <RefreshCw className="w-4 h-4" aria-hidden /> Recarregar
            </button>
            <button onClick={() => { window.location.href = '/'; }} className="btn-outline">
              <Home className="w-4 h-4" aria-hidden /> Voltar ao início
            </button>
          </div>
        </div>
      </div>
    );
  }
}
