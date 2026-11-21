import { useCallback, useEffect, useRef, useState } from 'react';

import { type EdicaoDoApp, type EstadoDoAcesso, estadoDoAcesso, type FaixaDeclarada } from '../../core/acessoSemConta';
import { FLAG_ACESSO_RESTRITO_SEM_CONTA } from '../../core/planos';
import { edicaoEstatica } from '../edicaoEstatica';
import { gravarFaixaSemConta, lerFaixaSemConta } from '../faixaSemConta';
import { useFlag } from '../flags';
import { authRequired } from '../supabase';

/** O `idb` e o store do modo sem conta só descem quando a regra vale — e só para esta contagem. */
let store: Promise<typeof import('../../data/efemero/store')> | null = null;
const contarSessoesLocais = async () => {
  store ??= import('../../data/efemero/store');
  return (await (await store).abrirStore()).count('sessoes');
};

/** As telas que COMEÇAM uma sessão: entrar nelas reconta, e a 2ª sessão abre a porta. */
const TELAS_QUE_GRAVAM: ReadonlySet<string> = new Set(['capture', 'interprete']);

function edicaoDoApp(): EdicaoDoApp {
  if (edicaoEstatica()) return 'estatica';
  return authRequired ? 'web' : 'selfhost';
}

export interface AcessoSemConta {
  acesso: EstadoDoAcesso;
  faixa: FaixaDeclarada;
  declararFaixa: (f: 'adulto' | 'menor') => void;
}

/**
 * O ACESSO SEM CONTA v2 no App (openspec `acesso-sem-conta-v2`, flag `acesso_restrito_sem_conta`).
 *
 * A regra é a pura do core (`estadoDoAcesso`); aqui só se junta o que ela pede. As sessões são as do
 * IndexedDB do modo sem conta (nenhum contador novo), contadas em dois momentos:
 *  · na chegada: quem volta ao app depois do 1º uso já encontra a porta;
 *  · ao entrar numa tela que grava: a 2ª sessão abre a porta.
 * Entre um e outro, nada reconta: a pessoa que acabou de gravar a 1ª sessão joga com as palavras dela
 * e vê o cartão "Guarde o que você capturou" no Início, sem a porta cair no meio.
 *
 * Flag desligada, com conta, edição estática ou self-host: `livre` e NENHUMA leitura do IndexedDB,
 * o mesmo app de antes.
 */
export function useAcessoSemConta({ anonimo, activeView }: { anonimo: boolean; activeView: string }): AcessoSemConta {
  const flagLigada = useFlag(FLAG_ACESSO_RESTRITO_SEM_CONTA);
  const [faixa, setFaixa] = useState<FaixaDeclarada>(lerFaixaSemConta);
  const [sessoes, setSessoes] = useState(0);
  const edicao = edicaoDoApp();
  const regraVale = flagLigada && anonimo && edicao === 'web';
  const gravando = TELAS_QUE_GRAVAM.has(activeView);
  const contouNaChegada = useRef(false);

  /* Reconta quando a regra passa a valer (a chegada, ou a flag que chegou do servidor) e a cada entrada
     numa tela que grava. Sair dela não reconta: a 1ª sessão salva não derruba a porta sobre o jogo. */
  useEffect(() => {
    if (!regraVale) {
      contouNaChegada.current = false;
      return;
    }
    if (contouNaChegada.current && !gravando) return;
    const ehChegada = !contouNaChegada.current;
    contouNaChegada.current = true;
    let vivo = true;
    let chegou = false;
    contarSessoesLocais()
      .then((n) => {
        chegou = true;
        if (vivo) setSessoes(n);
      })
      .catch(() => {
        /* sem IndexedDB: a regra fica em `livre`, que é o app de sempre */
      });
    return () => {
      vivo = false;
      /* Desfeito antes da resposta (o StrictMode monta duas vezes): a chegada ainda não foi contada. */
      if (ehChegada && !chegou) contouNaChegada.current = false;
    };
  }, [regraVale, gravando]);

  const declararFaixa = useCallback((f: 'adulto' | 'menor') => {
    gravarFaixaSemConta(f);
    setFaixa(f);
  }, []);

  const acesso = estadoDoAcesso({
    sessoesLocais: sessoes,
    faixaDeclarada: faixa,
    flagLigada,
    temConta: !anonimo,
    edicao,
  });
  return { acesso, faixa, declararFaixa };
}
