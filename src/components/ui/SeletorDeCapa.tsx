import { Check, ImagePlus, Loader2, Search } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { type ImageResult, searchImages } from '../../data/api';

/**
 * A FILEIRA DE CAPAS — `seletorDeCapa()` do protótipo aprovado, usada ao encerrar a captura (C8) e
 * ao editar uma sessão da Biblioteca (B3).
 *
 * As quatro capas do protótipo são gradientes. Aqui elas são IMAGENS de verdade: "Padrão" é a capa
 * sem imagem (o card mostra o ícone do tipo de mídia sobre o gradiente da marca) e as outras três
 * viram um SVG em data URL — o mesmo `imageUrl` que uma foto buscada ou colada, então a capa aparece
 * igual na Biblioteca, no Início e na busca sem nenhum caso especial.
 *
 * O botão de imagem abre a busca no Openverse (sem chave); o que foi escolhido fora da fileira
 * (foto buscada, colada ou de arquivo) entra nela como mais uma opção marcada.
 */
const GRADIENTES: Array<[string, string]> = [
  ['#3E5C76', '#7FA7C9'],
  ['#4F7A3A', '#A8C686'],
  ['#6B4E9B', '#C3A6E8'],
];

const capaDeGradiente = ([a, b]: [string, string]) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/></svg>`,
  );

/** As três capas prontas (a quarta, "Padrão", é a ausência de imagem). */
export const CAPAS_PRONTAS = GRADIENTES.map(capaDeGradiente);

/** O fundo CSS de uma capa, para a miniatura de prévia (`.capa-mini`) e para as opções. */
export function fundoDaCapa(url: string): string {
  if (!url) return 'linear-gradient(135deg,#E8542B,#F2A65A)';
  return `center / cover no-repeat url("${url.replace(/"/g, '%22')}")`;
}

export default function SeletorDeCapa({
  capa,
  aoTrocar,
  buscaInicial = '',
  extraDaBusca,
  aoEscolherArquivo,
}: {
  capa: string;
  aoTrocar: (url: string) => void;
  /** Termo que já vem preenchido na busca (o título da sessão). */
  buscaInicial?: string;
  /** Conteúdo a mais dentro do painel da busca (a Captura põe ali o campo de endereço). */
  extraDaBusca?: ReactNode;
  /** "escolher um arquivo": abre o seletor de arquivo de quem usa. */
  aoEscolherArquivo: () => void;
}) {
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState(buscaInicial);
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ImageResult[]>([]);

  const buscar = async () => {
    const q = busca.trim();
    if (!q || buscando) return;
    setBuscando(true);
    try {
      setResultados(await searchImages(q));
    } finally {
      setBuscando(false);
    }
  };

  const prontas = CAPAS_PRONTAS.map((url, i) => ({ url, thumb: url, rotulo: `Capa ${i + 2}` }));
  const achadas = resultados.slice(0, 7).map((r) => ({ url: r.url, thumb: r.thumbnail, rotulo: r.title || 'Capa' }));
  const conhecida = [...prontas, ...achadas].some((o) => o.url === capa);
  const opcoes = [
    ...prontas,
    ...(capa && !conhecida ? [{ url: capa, thumb: capa, rotulo: 'Capa escolhida' }] : []),
    ...achadas,
  ];

  return (
    <div>
      <span className="label-mono">Capa</span>
      <div className="capas" role="radiogroup" aria-label="Capa">
        <button
          type="button"
          className="capa-op"
          role="radio"
          aria-checked={capa === ''}
          aria-label="Padrão"
          style={{ background: fundoDaCapa('') }}
          onClick={() => aoTrocar('')}
        >
          {capa === '' && <Check aria-hidden />}
        </button>
        {opcoes.map((o) => (
          <button
            key={o.url}
            type="button"
            className="capa-op"
            role="radio"
            aria-checked={capa === o.url}
            aria-label={o.rotulo}
            style={{ background: fundoDaCapa(o.thumb) }}
            onClick={() => aoTrocar(o.url)}
          >
            {capa === o.url && <Check aria-hidden />}
          </button>
        ))}
        <button
          type="button"
          className="capa-op mais"
          aria-label="Buscar imagem de capa"
          aria-expanded={aberta}
          onClick={() => setAberta((v) => !v)}
        >
          <ImagePlus aria-hidden />
        </button>
      </div>
      {aberta && (
        <div className="pilha entra" style={{ marginTop: 10 }}>
          <div className="linha" style={{ gap: 8 }}>
            <label className="busca" style={{ flex: 1, maxWidth: 'none' }}>
              <Search aria-hidden />
              <span className="sr">Buscar imagem de capa</span>
              <input
                className="campo"
                value={busca}
                placeholder="Ex.: reunião, arquitetura, oceano…"
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void buscar();
                  }
                }}
              />
            </label>
            <button type="button" className="btn btn-outline" onClick={() => void buscar()} disabled={buscando}>
              {buscando ? <Loader2 aria-hidden className="animate-spin" /> : <Search aria-hidden />} Buscar
            </button>
          </div>
          {extraDaBusca}
        </div>
      )}
      <p className="mut aj" style={{ marginTop: 6 }}>
        Também dá para colar uma imagem com <kbd>Ctrl</kbd>+<kbd>V</kbd> ou{' '}
        <button type="button" className="link" onClick={aoEscolherArquivo}>
          escolher um arquivo
        </button>
        .
      </p>
    </div>
  );
}
