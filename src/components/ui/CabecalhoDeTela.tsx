import type { ReactNode } from 'react';

/**
 * CABEÇALHO DE TELA — kicker, título, subtítulo e ações, na hierarquia do protótipo v3.
 *
 * O DEFEITO QUE ISTO CONSERTA. Cada tela abria com o seu próprio cabeçalho escrito à mão: o Hub
 * com `label-mono` + `h1 text-3xl md:text-4xl`, Vocabulário com `h1 text-2xl md:text-3xl` e o
 * botão de exportar pendurado num `flex justify-between`, Jogar com um ícone num quadrado e uma
 * pílula de contagem, Biblioteca com DOIS títulos ("Minhas Lições" na barra e "Minha biblioteca de
 * leitura" abaixo, ux-v2 §1.8). Quatro tamanhos de título para o mesmo papel, e a pessoa que
 * troca de tela sente a moldura mudar.
 *
 * A HIERARQUIA É UMA SÓ, e mora em `.titulo-de-tela` (index.css): display 900, tracking −0,02em,
 * 24 px no celular e 28 px do `md`. O kicker é o `label-mono` que a app já usa como caption; o
 * subtítulo tem `max-w-[62ch]` para a linha não virar parágrafo em tela larga.
 *
 * O TÍTULO É UM `<h1>` SEMPRE. Cada tela tem um, e é ele que o leitor de tela anuncia ao chegar.
 * As ações ficam num `<div>` à direita (ou abaixo, no celular): o cabeçalho não decide o que são,
 * só onde ficam.
 */
interface CabecalhoDeTelaProps {
  /** Linha pequena em mono acima do título ("Seu estudo", "Antes de jogar"). Pode levar ícone. */
  kicker?: ReactNode;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** Botões e pílulas à direita do título. */
  acoes?: ReactNode;
  className?: string;
}

export default function CabecalhoDeTela({ kicker, titulo, subtitulo, acoes, className = '' }: CabecalhoDeTelaProps) {
  return (
    <header className={`flex flex-wrap items-start justify-between gap-x-6 gap-y-3 mb-6 ${className}`}>
      <div className="min-w-0 flex-1">
        {kicker && <div className="label-mono text-accent-ink flex items-center gap-1.5 mb-1">{kicker}</div>}
        <h1 className="titulo-de-tela text-balance">{titulo}</h1>
        {subtitulo && <p className="text-ink-muted text-sm max-w-[62ch] mt-1.5">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2 shrink-0">{acoes}</div>}
    </header>
  );
}
