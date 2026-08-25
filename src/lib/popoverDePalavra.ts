/**
 * O ESTADO DO CARTÃO FLUTUANTE DA PALAVRA — declarado UMA vez.
 *
 * POR QUE ISTO EXISTE. `Analysis.tsx` e `Reading.tsx` declaravam as mesmas quatro peças
 * (`hoveredWord`, `popoverPosition`, `isHoveringPopover`, `hideTimeoutRef`) e repetiam o mesmo par
 * abrir/fechar. E não são telas irmãs: `Analysis.tsx` RENDERIZA `<Reading>` dentro de si na aba
 * Leitura — as duas cópias coexistem em memória, cada uma com o seu `hoveredWord`.
 *
 * Extrair só a moldura visual não resolvia: o `jscpd` voltou a medir 17 linhas clonadas, agora nos
 * dois LOCAIS DE CHAMADA, porque o que se repetia de verdade era a INTERAÇÃO, não o desenho.
 *
 * A regra que este hook guarda é uma só, e é a que quebra se as duas cópias divergirem: sair da
 * palavra AGENDA o fechamento (300 ms) em vez de fechar na hora, e entrar no cartão CANCELA esse
 * agendamento. É esse par que permite atravessar o vão entre a palavra e o cartão sem que ele suma
 * no caminho — o tipo de detalhe que ninguém repara até parar de funcionar num dos dois lados.
 *
 * O QUE CONTINUA SEPARADO, DE PROPÓSITO: o `handleMouseEnter` de cada tela. Eles divergem de
 * verdade — a Leitura filtra palavra de conteúdo ali dentro e lê `e.target`; a Análise já recebe o
 * token filtrado e lê `e.currentTarget` (que não é a mesma coisa quando o `<span>` tem filhos).
 * Por isso `cancelarFechamento` e `abrirEm` são passos separados: a Leitura cancela ANTES do filtro
 * e a Análise cancela sempre, e as duas continuam fazendo exatamente o que faziam.
 */
import React from 'react';
import { posicaoPopoverPalavra } from './posicaoFlutuante';

/** Milissegundos entre sair da palavra e o cartão fechar. É a travessia até o cartão. */
const ATRASO_DE_FECHAMENTO = 300;

export interface PopoverDePalavra {
  /** Palavra sob o cursor. `null` = nenhum cartão aberto. */
  palavra: string | null;
  setPalavra: React.Dispatch<React.SetStateAction<string | null>>;
  /** Cancela um fechamento já agendado. */
  cancelarFechamento: () => void;
  /** Abre (ou reposiciona) o cartão junto ao elemento da palavra. */
  abrirEm: (alvo: HTMLElement, palavraLimpa: string) => void;
  /** Agenda o fechamento. Não fecha se o cursor tiver entrado no cartão nesse meio-tempo. */
  agendarFechamento: () => void;
  /** As props da moldura — repassar direto para `<PopoverFlutuante {...props} />`. */
  props: {
    posicao: { top: number; left: number };
    onEntrar: () => void;
    onSair: () => void;
  };
}

export function usePopoverDePalavra(): PopoverDePalavra {
  const [palavra, setPalavra] = React.useState<string | null>(null);
  const [posicao, setPosicao] = React.useState({ top: 0, left: 0 });
  const [sobreOCartao, setSobreOCartao] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);

  const cancelarFechamento = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const abrirEm = (alvo: HTMLElement, palavraLimpa: string) => {
    const rect = alvo.getBoundingClientRect();
    // M-08: o cálculo de posição já era compartilhado (`posicaoFlutuante`); o estado, não.
    setPosicao(posicaoPopoverPalavra(rect, { width: window.innerWidth, height: window.innerHeight }));
    setPalavra(palavraLimpa);
  };

  /*
   * SEM `useCallback`, e isto é intencional: o callback do timer lê `sobreOCartao` da renderização
   * em que foi criado. Era exatamente assim nas duas cópias originais, e memoizar mudaria qual
   * valor o timer enxerga — ou seja, mudaria comportamento numa extração que não pode mudar nenhum.
   */
  const agendarFechamento = () => {
    timerRef.current = window.setTimeout(() => {
      if (!sobreOCartao) setPalavra(null);
    }, ATRASO_DE_FECHAMENTO);
  };

  return {
    palavra,
    setPalavra,
    cancelarFechamento,
    abrirEm,
    agendarFechamento,
    props: {
      posicao,
      onEntrar: () => {
        setSobreOCartao(true);
        cancelarFechamento();
      },
      onSair: () => {
        setSobreOCartao(false);
        setPalavra(null);
      },
    },
  };
}
