import React from 'react';

import { navegarPara, urlParaEstado } from '../../lib/rotas';

/**
 * O markdown mínimo das respostas, como o protótipo (`md`): `**negrito**` e quebra de linha — e
 * link `[texto](https://…)`, porque os avisos de falha do tutor apontam para o ollama.com — e o link
 * interno `[texto](/plano)`, que leva a outra tela do app SEM recarregar a página (o aviso de "o tutor é
 * dos planos pagos" aponta para a tela Planos).
 * Sem `innerHTML`: o texto do modelo nunca vira marcação.
 */
export function TextoDoChat({ texto }: { texto: string }) {
  const linhas = texto.split('\n');
  return (
    <>
      {linhas.map((linha, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {pedacos(linha)}
        </React.Fragment>
      ))}
    </>
  );
}

function pedacos(linha: string): React.ReactNode[] {
  const saida: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\[([^\]]+)\]\((\/[a-z0-9/-]*)\)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(linha))) {
    if (m.index > ultimo) saida.push(linha.slice(ultimo, m.index));
    if (m[1] !== undefined) saida.push(<b key={k++}>{m[1]}</b>);
    else if (m[5] !== undefined) {
      const caminho = m[5];
      saida.push(
        <a
          key={k++}
          href={caminho}
          onClick={(e) => {
            e.preventDefault();
            navegarPara(urlParaEstado(caminho));
          }}
        >
          {m[4]}
        </a>,
      );
    } else
      saida.push(
        <a key={k++} href={m[3]} target="_blank" rel="noreferrer">
          {m[2]}
        </a>,
      );
    ultimo = m.index + m[0].length;
  }
  if (ultimo < linha.length) saida.push(linha.slice(ultimo));
  return saida;
}
