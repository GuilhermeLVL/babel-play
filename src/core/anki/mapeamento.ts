import { extrairMidia, limparELacunas } from './campo';
import type { NotaAnki } from './tipos';

/** Separador de campos de uma nota do Anki. */
const SEP = '\x1f';

/**
 * TETO DE NOTAS lidas de um único `.apkg` — o conserto para o baralho de 300k notas que hoje
 * carrega tudo em memória de uma vez porque `SELECT ... FROM notes` não tem LIMIT.
 *
 * 50 mil é folgado para todo baralho de idioma real (o maior do AnkiWeb fica na casa dos
 * milhares) e ainda cabe num array em memória sem risco de repetir o F4-01 por outra porta.
 */
export const TETO_DE_NOTAS = 50_000;

/** Qual campo é a frase de exemplo? Pelo NOME, quando o baralho nomeia os campos. */
export function indiceDoExemplo(campos: string[]): number {
  const alvo = /(example|exemplo|sentence|frase|context|contexto|usage)/i;
  return campos.findIndex((c) => alvo.test(c));
}

/**
 * QUAL CAMPO É A PALAVRA E QUAL É O SENTIDO — pelo NOME, e não pela posição.
 *
 * O DEFEITO QUE ISTO CONSERTA, medido com o baralho "4000 Essential English Words" do AnkiWeb
 * (3.871 notas): a frente vinha de `flds[0]` e o verso de `flds[1]`, fixos. Naquele baralho os
 * dois primeiros campos do tipo de nota principal são `№` e `IMG` — um número de ordem e uma tag
 * `<img>`. Depois de `limparCampo` a imagem vira string vazia, o par nasce sem verso, e as 3.871
 * notas caíam todas no `descartadas++`: o importador dizia "0 notas lidas" sobre um baralho
 * perfeitamente válido, e não havia como a pessoa descobrir por quê.
 *
 * O parser JÁ LIA os nomes dos campos (`camposPorModelo`) e já os usava para achar o exemplo —
 * só nunca os usou para os dois campos que decidem se a nota existe. Era a peça que estava na
 * mesa e não tinha sido ligada.
 *
 * A PRIORIDADE É POR PADRÃO, não por posição no baralho: `Word` vence `Front` quando o baralho
 * tem os dois, porque `Word` é o conteúdo e `Front` costuma ser o template do cartão. Isso exige
 * varrer os padrões em ordem — um `findIndex` sozinho varreria o ARRAY e devolveria o que viesse
 * primeiro nele, que é o contrário do pretendido (foi o que um teste pegou).
 *
 * Sem nomes reconhecíveis, volta ao posicional — que é o certo para o baralho de dois campos sem
 * nome, ainda o caso mais comum.
 */
export const PADRAO_FRENTE: RegExp[] = [
  /^(word|palavra|term|termo|expression|expressão|vocab\w*|english|inglês)$/i,
  /^(front|frente|question|pergunta)$/i,
];
export const PADRAO_VERSO: RegExp[] = [
  /^(meaning|significado|sentido|definition|definição|translation|tradução|portuguese|português)$/i,
  /^(back|verso|answer|resposta)$/i,
];

/**
 * Acha o campo pelo nome: TODOS os padrões por igualdade primeiro, e só então por conter.
 *
 * A igualdade vem antes porque `Sound_Meaning` CONTÉM "meaning" e é um ÁUDIO: num baralho com
 * `Meaning` e `Sound_Meaning`, casar por conteúdo primeiro poria um marcador de som no verso.
 */
export function indicePorNome(campos: string[], padroes: RegExp[]): number {
  const limpos = campos.map((c) => (c ?? '').trim());
  for (const padrao of padroes) {
    const exato = limpos.findIndex((c) => padrao.test(c));
    if (exato >= 0) return exato;
  }
  for (const padrao of padroes) {
    const solto = new RegExp(padrao.source.replace(/^\^|\$$/g, ''), 'i');
    const i = limpos.findIndex((c) => solto.test(c));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Monta a nota a partir de uma linha da tabela `notes` — o corpo do laço do `lerApkg`, puro, para
 * o navegador e o servidor lerem do mesmo jeito. `null` quando falta frente OU verso: não há
 * cartão, e quem chama conta uma descartada.
 */
export function montarNota(entrada: {
  guid: string;
  flds: string;
  tags: string;
  nomesDosCampos: string[];
  notetype?: string;
  baralho?: string;
}): NotaAnki | null {
  const { guid, flds, tags, nomesDosCampos: nomes, notetype, baralho } = entrada;
  const partes = flds.split(SEP);

  // Mídia é extraída do campo BRUTO — depois de `limparCampo` a referência já não existe.
  const sons: string[] = [];
  const imagens: string[] = [];
  for (const parte of partes) {
    const m = extrairMidia(parte ?? '');
    for (const s of m.sons) if (!sons.includes(s)) sons.push(s);
    for (const im of m.imagens) if (!imagens.includes(im)) imagens.push(im);
  }
  const midia = sons.length || imagens.length ? { sons, imagens } : undefined;

  // Cloze resolvido ANTES de limpar (ver `limparELacunas`), campo a campo.
  const camposLimpos = partes.map((p) => limparELacunas(p ?? ''));
  const lacunasDaNota = camposLimpos.flatMap((c) => c.lacunas).sort((a, b) => a.ordinal - b.ordinal);

  /* Pelo NOME quando o baralho os nomeia; posicional quando não (ver `indicePorNome`). O
     índice só vale se o campo tiver conteúdo depois de limpo — um `Meaning` vazio não é
     melhor que o `flds[1]` que ele substituiria. */
  const porNomeOuPosicao = (padroes: RegExp[], posicao: number) => {
    const i = indicePorNome(nomes, padroes);
    return (i >= 0 ? camposLimpos[i]?.texto : '') || camposLimpos[posicao]?.texto || '';
  };
  const frente = porNomeOuPosicao(PADRAO_FRENTE, 0);
  const verso = porNomeOuPosicao(PADRAO_VERSO, 1);
  // Sem frente OU sem verso não há cartão: um dos dois lados seria inventado.
  if (!frente || !verso) return null;

  const iExemplo = indiceDoExemplo(nomes);
  const cru = iExemplo >= 0 ? (camposLimpos[iExemplo]?.texto ?? '') : (camposLimpos[2]?.texto ?? '');
  /* O exemplo não pode ser a própria palavra nem a própria tradução: onde o posicional cai em
     cima de um dos dois, a frase "de contexto" seria a resposta repetida. */
  const exemplo = cru && cru !== frente && cru !== verso ? cru : '';

  /* OS CAMPOS ORIGINAIS, POR NOME — a promessa de "reclassificar sem reimportar" mora aqui.
     Quem só guardasse frente/verso/exemplo estaria jogando fora o resto da nota (leitura,
     pitch accent, frequência, o campo que o mapeamento automático não reconheceu), e trocar o
     mapeamento depois exigiria o arquivo de novo — 214 MB, no baralho que medimos. Guardamos o
     BRUTO, não o limpo: a limpeza é uma decisão nossa e precisa poder ser refeita. Campo sem
     nome (baralho antigo, sem `fields`) entra pela posição, que é a identidade que ele tem. */
  const camposBrutos: Record<string, string> = {};
  partes.forEach((valor, i) => {
    camposBrutos[nomes[i] || `campo${i}`] = valor ?? '';
  });

  return {
    guid,
    frente,
    verso,
    exemplo: exemplo || undefined,
    tags: tags.split(/\s+/).filter(Boolean),
    camposBrutos,
    midia,
    lacunas: lacunasDaNota.length ? lacunasDaNota : undefined,
    baralho,
    notetype: notetype || undefined,
    campos: nomes,
  };
}
