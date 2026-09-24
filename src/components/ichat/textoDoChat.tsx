import React from 'react';

/**
 * O markdown mínimo das respostas, como o protótipo (`md`): `**negrito**` e quebra de linha — e
 * link `[texto](https://…)`, porque os avisos de falha do tutor apontam para o ollama.com.
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
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(linha))) {
    if (m.index > ultimo) saida.push(linha.slice(ultimo, m.index));
    if (m[1] !== undefined) saida.push(<b key={k++}>{m[1]}</b>);
    else
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
