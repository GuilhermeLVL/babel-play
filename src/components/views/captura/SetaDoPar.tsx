import { ArrowRight } from 'lucide-react';

/**
 * A seta ENTRE os dois idiomas — a mesma ideia nas duas formas, o desenho seguindo a forma.
 *
 * Na linha ela aponta para a direita e ganha `mt-3` para descer até a altura da caixa (os campos
 * têm rótulo em cima, então o centro vertical do grupo não é o centro da caixa). Empilhada ela
 * gira para baixo e alinha com o texto do campo (`ms-3` = o `px-3` do botão em modo `block`),
 * formando uma espinha vertical entre origem e destino.
 */
export default function SetaDoPar({ empilhado }: { empilhado: boolean }) {
  return (
    <ArrowRight
      aria-hidden
      className={`w-3.5 h-3.5 text-ink-faint shrink-0 ${empilhado ? 'rotate-90 ms-3 -my-1' : 'mt-3'}`}
    />
  );
}
