import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { t } from '../lib/i18n';
import type { ImagemDaPalavra } from '../lib/imagens/criterios';
import Provenance from './Provenance';

/**
 * A GALERIA DA FOLHA DA PALAVRA — a imagem principal no lugar de sempre e as outras em miniaturas
 * logo abaixo.
 *
 * Por que mais de uma (relato do dono, 10/10/2026): com uma imagem só, a que vier errada é a única
 * coisa que a pessoa vê, e ela aprende a palavra pela imagem errada. Com até quatro, o sentido sai
 * do conjunto ("banco": o de sentar e o do dinheiro).
 *
 * TOCAR NUMA MINIATURA TROCA COM A PRINCIPAL, e é troca de verdade: a que estava em cima desce para
 * o lugar da que subiu. O botão continua no mesmo lugar (o foco do teclado não se perde) e passa a
 * mostrar a outra imagem. O crédito embaixo é sempre o da imagem que está em cima.
 *
 * SEM IMAGEM NÃO HÁ COLUNA: o componente devolve `null` e o texto ocupa a largura da folha
 * (`.qp:not(:has(.qp-imagem))` em `questSessao.css`). O critério de não haver imagem está em
 * `lib/imagens/imagensDaPalavra.ts`.
 */
export interface GaleriaDaPalavraProps {
  palavra: string;
  imagens: ImagemDaPalavra[];
  /** A busca ainda não voltou: o lugar da imagem mostra o aviso de sempre. */
  carregando: boolean;
}

export default function GaleriaDaPalavra({ palavra, imagens, carregando }: GaleriaDaPalavraProps) {
  /* A ordem em que as imagens estão na tela: a primeira é a principal. Guardada pelos ids, para
     sobreviver à lista que cresce (as figuras do verbete chegam antes das da busca livre). */
  const [ordem, setOrdem] = useState<string[]>([]);
  /* O endereço não abriu (arquivo apagado no acervo, bloqueio de rede): a imagem sai da galeria. */
  const [quebradas, setQuebradas] = useState<string[]>([]);

  const vivas = imagens.filter((i) => !quebradas.includes(i.id));
  const naOrdem = [
    ...ordem.map((id) => vivas.find((i) => i.id === id)).filter((i): i is ImagemDaPalavra => !!i),
    ...vivas.filter((i) => !ordem.includes(i.id)),
  ];
  const [principal, ...outras] = naOrdem;

  if (!principal) {
    if (!carregando) return null;
    return (
      <div className="qp-galeria">
        <div className="qp-imagem">
          <span role="status">
            <Loader2 className="animate-spin" aria-hidden /> {t('Buscando imagem…')}
          </span>
        </div>
      </div>
    );
  }

  const trocar = (id: string) => {
    const ids = naOrdem.map((i) => i.id);
    const lugar = ids.indexOf(id);
    if (lugar < 1) return;
    [ids[0], ids[lugar]] = [ids[lugar], ids[0]];
    setOrdem(ids);
  };

  const credito = (i: ImagemDaPalavra) => [i.autor, i.licenca, i.acervo].filter(Boolean).join(', ');

  return (
    <div className="qp-galeria" data-testid="galeria-da-palavra">
      <div className="qp-imagem">
        <img
          src={principal.url}
          alt={t('{palavra}: {titulo}', { palavra, titulo: principal.titulo })}
          referrerPolicy="no-referrer"
          onError={() => setQuebradas((q) => [...q, principal.id])}
        />
      </div>
      {outras.length > 0 && (
        <div className="qp-miniaturas" role="group" aria-label={t('Outras imagens de {palavra}', { palavra })}>
          {outras.map((imagem, i) => (
            // A chave é o LUGAR, não a imagem: o botão fica, o conteúdo troca, o foco não se perde.
            <button
              key={i}
              type="button"
              className="qp-miniatura"
              aria-label={t('Mostrar em cima a imagem {n} de {total}: {titulo}. {credito}', {
                n: i + 2,
                total: naOrdem.length,
                titulo: imagem.titulo,
                credito: credito(imagem),
              })}
              onClick={() => trocar(imagem.id)}
            >
              <img
                src={imagem.url}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setQuebradas((q) => [...q, imagem.id])}
              />
            </button>
          ))}
        </div>
      )}
      {/* O crédito da imagem que está em cima, com o selo de procedência de sempre. `aria-live`: quem
          não vê a troca ouve de quem é a imagem que subiu. No celular ele desce para o fim da folha
          (`questSessao.css`), para a tradução não sair da parte visível. */}
      <div className="qp-credito" aria-live="polite" data-testid="credito-da-imagem">
        <Provenance
          className="qp-procedencia"
          kind="source"
          // Há arquivo do acervo sem licença nos dados (o banco de sentar de "banco"): a página a traz.
          origin={`${principal.acervo} · ${principal.licenca ?? t('licença na página da imagem')}`}
          method={principal.autor ? t('imagem de {autor}', { autor: principal.autor }) : undefined}
          url={principal.pagina}
          limits={
            principal.fonte === 'verbete'
              ? t(
                  'Quem editou o verbete do Wikcionário escolheu esta imagem para ilustrar um dos sentidos da palavra. Ela mostra um sentido, não todos: confira a definição.',
                )
              : t(
                  'Imagem livre cujo título é a própria palavra, achada no Openverse. Ninguém conferiu se ela mostra o sentido desta frase: confira a definição.',
                )
          }
        />
      </div>
    </div>
  );
}
