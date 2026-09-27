import { classesDoEstilo, ESTILOS_DE_LEGENDA, resolverEstiloDeLegenda } from '../lib/estilosDeLegenda';

/* O CSS dos estilos vem SOB DEMANDA: a miniatura mora no grafo de arranque (o modal de recompensa)
   e o orçamento de CSS inicial não comporta uma folha que só a prévia usa. A captura, que usa os
   estilos de verdade, importa a folha pelo caminho normal. */
let folha: Promise<unknown> | null = null;
const carregarFolha = () => (folha ??= import('../styles/legendas.css'));

/**
 * A PRÉVIA AO VIVO DE UM ESTILO DE LEGENDA (onda 4): a mesma caixa escura das legendas flutuantes,
 * com uma fala de verdade e uma palavra "aprendida", vestindo exatamente as classes que a legenda
 * vai receber. Mostra o estilo mesmo que ainda não seja seu (é a vitrine), mas respeita o
 * movimento reduzido.
 */
export default function PreviaDaLegenda({ estilo, compacta = false }: { estilo: string; compacta?: boolean }) {
  if (typeof document !== 'undefined') void carregarFolha();
  const e = resolverEstiloDeLegenda(estilo, { possui: (id) => ESTILOS_DE_LEGENDA.some((x) => x.id === id) });
  return (
    <span
      className={`previa-leg-estilo ${classesDoEstilo(e)}`}
      aria-hidden
      style={{
        display: 'grid',
        gap: 2,
        width: '100%',
        padding: compacta ? '6px 8px' : '10px 12px',
        borderRadius: 10,
        background: 'rgba(16,14,12,.92)',
        color: '#fff',
        textAlign: 'left',
        ['--leg-contorno-cor' as string]: 'rgba(0,0,0,.85)',
      }}
    >
      <span className="leg-fala" style={{ display: 'grid', gap: 2 }}>
        <span className="leg-o" style={{ fontWeight: 600 }}>
          We ship the <span data-aprendida>roadmap</span> today.
        </span>
        {!compacta && <span style={{ color: '#FFEA00', fontSize: '.85em', opacity: 0.85 }}>Entregamos o roteiro hoje.</span>}
      </span>
    </span>
  );
}
