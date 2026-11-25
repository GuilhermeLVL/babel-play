import { extrairMidia, limparELacunas } from './campo';
import {
  indiceDoExemplo,
  indicePorNome,
  PADRAO_FRENTE,
  PADRAO_VERSO,
  type PapelNaImportacao,
  textosDaNota,
} from './mapeador';
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

/*
 * QUAL CAMPO É A PALAVRA E QUAL É O SENTIDO — pelo NOME, e não pela posição.
 *
 * O DEFEITO QUE ISTO CONSERTA, medido com o baralho "4000 Essential English Words" do AnkiWeb (3.871 notas): a frente
 * vinha de `flds[0]` e o verso de `flds[1]`, fixos. Naquele baralho os dois primeiros campos do tipo de nota principal
 * são `№` e `IMG`; depois de `limparCampo` a imagem vira vazio, o par nasce sem verso e as 3.871 notas caíam no
 * `descartadas++`: "0 notas lidas" sobre um baralho válido.
 *
 * Os nomes conhecidos e a ordem de prioridade (`Word` vence `Front`; igualdade antes de "contém", porque `Sound_Meaning`
 * contém "meaning" e é áudio) moram agora em `priorsDeCampos.json`, lidos por `mapeador.ts` — que também diz a
 * CONFIANÇA do palpite. Sem nomes reconhecíveis, volta ao posicional: o certo para o baralho de dois campos sem nome.
 */
export { indiceDoExemplo, indicePorNome, PADRAO_FRENTE, PADRAO_VERSO } from './mapeador';

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
  /** Papéis por campo decididos por `inferirMapeamento` (confiança, perfil ou escolha da pessoa). Sem isto, vale o
   *  caminho de sempre: nome primeiro, posição depois. */
  mapeamento?: PapelNaImportacao[];
}): NotaAnki | null {
  const { guid, flds, tags, nomesDosCampos: nomes, notetype, baralho, mapeamento } = entrada;
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
  let frente: string;
  let verso: string;
  let exemplo = '';
  if (mapeamento) {
    // Papéis já decididos (a pessoa os viu, ou o perfil/palpite os trouxe): sem segunda adivinhação por posição.
    ({ frente, verso, exemplo } = textosDaNota(
      camposLimpos.map((c) => c.texto),
      mapeamento,
    ));
  } else {
    frente = porNomeOuPosicao(PADRAO_FRENTE, 0);
    verso = porNomeOuPosicao(PADRAO_VERSO, 1);
  }
  // Sem frente OU sem verso não há cartão: um dos dois lados seria inventado.
  if (!frente || !verso) return null;

  if (!mapeamento) {
    const iExemplo = indiceDoExemplo(nomes);
    const cru = iExemplo >= 0 ? (camposLimpos[iExemplo]?.texto ?? '') : (camposLimpos[2]?.texto ?? '');
    /* O exemplo não pode ser a própria palavra nem a própria tradução: onde o posicional cai em
       cima de um dos dois, a frase "de contexto" seria a resposta repetida. */
    exemplo = cru && cru !== frente && cru !== verso ? cru : '';
  }

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
