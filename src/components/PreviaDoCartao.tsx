import { classeDoCartao, type EstadoDoCartao, PELES_DE_CARTAO } from '../lib/pelesDeCartao';

/* O CSS das peles vem SOB DEMANDA (como o das legendas): a miniatura mora no grafo de arranque, e
   só a prévia e o Estudar usam a folha. */
let folha: Promise<unknown> | null = null;
const carregarFolha = () => (folha ??= import('../styles/cartoes.css'));

const ESTADOS: Array<[EstadoDoCartao, string]> = [
  ['nova', 'nova'],
  ['aprendida', 'aprendida'],
  ['dominada', 'dominada'],
];

/**
 * A PRÉVIA AO VIVO DE UMA PELE DE CARTÃO (onda 4): os três estados lado a lado, com as MESMAS
 * classes que o cartão do Estudar recebe. Mostra a pele mesmo que ainda não seja sua (é a vitrine).
 */
export default function PreviaDoCartao({ pele, compacta = false }: { pele: string; compacta?: boolean }) {
  if (typeof document !== 'undefined') void carregarFolha();
  const todas = (id: string) => PELES_DE_CARTAO.some((p) => p.id === id);
  return (
    <span aria-hidden style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, width: '100%' }}>
      {ESTADOS.map(([estado, rotulo]) => (
        <span
          key={estado}
          className={`cartao ${classeDoCartao(pele, estado, todas)}`}
          style={{
            display: 'grid',
            placeItems: 'center',
            minHeight: compacta ? 34 : 58,
            padding: 4,
            fontSize: compacta ? 9 : 11,
            fontWeight: 700,
            color: 'var(--ink-muted)',
          }}
        >
          {rotulo}
        </span>
      ))}
    </span>
  );
}
