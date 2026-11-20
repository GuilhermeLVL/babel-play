# Etiquetas de palavras — lado do servidor (26/10/2026)

A legenda marca cada palavra pelo que a pessoa já sabe dela: vista antes, salva, em estudo, dominada. Este
documento é o contrato do servidor; o cliente (legenda e gaveta da palavra) vem numa frente separada.

## O índice

`palavras_vistas` (migração PG 0012): por sessão, quantas vezes cada palavra apareceu nas falas.

- Chave: `chaveDaPalavra(token)` com o idioma BASE da fala (`utterance.sourceLang`, senão o da sessão), então
  `lang|chave` é o `vocab_cards.norm_key` do cartão da mesma palavra. Tokens por `palavrasDoTexto` (a mesma
  segmentação da legenda). Ficam de fora palavras funcionais (`PALAVRAS_FUNCIONAIS`), chaves com algarismo e
  chaves com menos de 2 caracteres (1 basta em ja/zh/th/lo/km/my). Regra única: `src/core/texto/palavrasVistas.ts`.
- `exemplo_idx`: o `idx` de uma fala que contém a palavra. O texto não é copiado; a rota confere a fala. Quando
  a palavra só perde ocorrência e o exemplo apontava para a fala que saiu, ele vira nulo (`frase: null`, sem
  varrer a sessão); a reconstrução devolve um exemplo válido. Só um exemplo que não confere (índice torto)
  dispara a varredura (até 2.000 falas).
- Manutenção na MESMA transação de toda escrita em falas, com `travarUsuario` e a leitura do que sai DENTRO
  dela (dois lotes iguais ao mesmo tempo se enfileiram em vez de contar a mesma fala duas vezes): criar sessão com falas, retomar a captura (reconstrói),
  lote da captura longa (diferença; repetir o lote não dobra), editar o texto de uma fala (diferença),
  reetiquetar o idioma e trocar o idioma da sessão (reconstrói), reparo de idioma (reconstrói), remover a
  sessão (apaga as linhas). A limpeza diária e a exclusão de conta levam o resto pelo `ON DELETE CASCADE`.
- Legado (sessões de antes do deploy): `node dist-server/operacao.cjs palavras reindexar [--usuario <id>]`.
  Idempotente; pode rodar com o servidor no ar.

Custo: o lote da captura longa faz no máximo 2 instruções no índice (1 upsert multi-VALUES + 1 DELETE só se
alguma palavra perdeu ocorrência), cobrado em `tests/integration/palavras-vistas.test.ts`. A segmentação
(`Intl.Segmenter`) de 5.000 falas custa ~56 ms de CPU em en/pt e ~76 ms em ja (Node 24, M-series, mediana de
5 rodadas): é o pior caso de "retomar a captura" de uma sessão no teto do schema.

A reetiquetagem de idioma e o reparo de idioma reconstroem as sessões tocadas no MESMO lote dos UPDATEs (ou
tudo, ou nada). `palavras reindexar` reconstrói em transações de 50 sessões.

## Contrato

```ts
GET /api/vocab/vistas?lang=xx -> 200 { lang: string; chaves: string[]; truncado: boolean } | 304 (ETag)
GET /api/vocab/palavra?lang=xx&chave=yy -> 200 {
  chave: string; lang: string;
  cartao: null | { id: string; estado: 'nova'|'aprendendo'|'dominada'; proximaRevisao: string|null; reps: number; lapses: number };
  vistas: { vezes: number; sessoes: number; primeiraEm: string|null; ultimaEm: string|null };
  onde: Array<{ sessaoId: string; titulo: string|null; quando: string; frase: string|null }>; // até 10
  jogos: Array<{ jogo: string; acertos: number; erros: number; ultimoEm: string }>;
  nota: string|null }
PUT /api/vocab/:id/nota { nota: string (<= 500; '' limpa) } -> 200 { id: string; nota: string|null } | 404 | 400
```

- `lang` aceita BCP-47 (`pt-BR`) e é reduzido à base. `chave` pode vir como a palavra escrita (`Água`).
- `vistas`: até 20.000 chaves, das mais vistas; acima disso `truncado: true`. ETag pela versão
  `versoes_de_dados.palavras`, com o idioma como variante: 304 custa uma consulta de chave primária. A versão
  sobe só quando o CONJUNTO de chaves pode ter mudado (linha nova ou que zerou no índice, reconstrução, sessão
  removida); somar ocorrência, traduzir, renomear e polir não invalidam.
- **Cliente:** pedir `vistas` ao abrir a tela e ao fim da captura, NUNCA durante a captura (ali a legenda
  marca pelo que acabou de ouvir). Mande `If-None-Match` com o ETag guardado.
- `palavra`: o estado do cartão é a régua de `src/core/learning/estadoDoCartao.ts` (a mesma da moldura do
  cartão; `aprendida` lá é `aprendendo` aqui). `quando` é a primeira vez que a palavra apareceu naquela sessão.
  `jogos` vem de `estado_por_item`, mais `revisao` de `review_logs` (acerto = nota >= 3). Palavra nunca vista
  nem salva: 200 com tudo zerado.
- `nota` também sai em `GET /api/vocab` (e em `get`/PATCH/review), e na exportação da conta.

## Sem conta e convidado

As rotas `vistas` e `palavra` não têm espelho no modo sem conta (`tests/contratos/rotas-espelhadas.test.ts`):
o índice só existe no servidor. Sem conta, a legenda marca só pelo estado do baralho local.

## LGPD

Dado do titular (ROPA T02): sai com a sessão, vai na exportação e sai na exclusão da conta (`TABELAS_DO_TITULAR`).
RLS ligada e `REVOKE` de `anon`/`authenticated`, como as outras tabelas.
