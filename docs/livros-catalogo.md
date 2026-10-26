# Catálogo de Livros: como montar, revisar e publicar

Fase L1 de [`docs/specs/2026-10-26-livros-e-leitura.md`](specs/2026-10-26-livros-e-leitura.md). O catálogo é um
JSON estático (`public/catalogo/livros.json`), gerado por um script que uma pessoa roda e versiona junto com o
resultado. Não há job, nem coleta em tempo de uso.

## 1. Montar o catálogo

```bash
npx tsx scripts/livros/montar-catalogo.mjs --ano=2026     # ~30 min na 1ª vez; depois sai do cache
npx tsx scripts/livros/montar-catalogo.mjs --verificar    # confere o JSON publicado (sai ≠ 0 se violar)
```

- **Fontes.** Standard Ebooks (listagem pública por popularidade + o EPUB de cada livro), Gutendex (metadados
  do Gutenberg: `death_year`, `translators`, `download_count`), o texto do Gutenberg por **espelho**
  (`mirrors.xmission.com`, `gutenberg.pglaf.org`; nunca `gutenberg.org`), Wikisource em português e a
  Wikidata (ano de morte de cada pessoa). MEC e Brasiliana ficam de fora (sem API).
- **Educação.** User-Agent identificado, um pedido por vez por host com intervalo (1,2 s a 2 s), espera em
  429/5xx, cache em `data/livros-cache/` (fora do git). Rodar de novo não baixa de novo.
- **Tamanho.** 16 idiomas da trilha + português, com profundidade em en (110), es (60) e pt (70; até 50 da
  Wikisource), 12 nos demais quando a fonte tem. Livro acima de 650 mil palavras (obras completas,
  dicionários) fica de fora.
- **Filtro legal** (`src/core/livros/filtroLegal.ts`, coberto por `tests/livros-filtro-legal.test.ts`): entra
  só quem tem todos os autores e tradutores com ano de morte até `ano − 71`. Sem ano de morte, fora; tradução
  sem tradutor identificado (a fonte ou o próprio texto dizem "translated by", "traducción de"…), fora. No fim
  o script confere cada livro de novo e não grava nada se um violar. O JSON guarda `ano` e `anoLimite`, e o
  cliente descarta o livro que passar do limite (defesa dupla).
- **Exclusões.** Todo livro que a fonte tem e o filtro recusou vai para `exclusoes` com o motivo. É o que a
  tela usa para responder "por que este livro não está?".
- **Nível estimado** (`src/core/livros/nivelEstimado.ts`): cobertura das listas CEFR de
  `src/data/trilha/niveis/<idioma>.json` (o menor nível em que as palavras conhecidas somam 90% das
  conhecidas) e fórmula de legibilidade (Flesch-Kincaid no inglês, Fernández-Huerta no espanhol, Flesch de
  Martins et al. no português), mediana de até 24 amostras de 1000 palavras. Verso e teatro usam só a
  cobertura. O português não tem lista na trilha e usa só a fórmula, que é a medida mais fraca do catálogo.
- **Exceções** (`scripts/livros/excecoes.json`): obra anônima ou coletiva só entra com justificativa escrita
  por item. Começa vazia.

## 2. Revisar a classificação etária (o dono)

Nenhum livro aparece para menor de idade sem revisão humana. A lista é `scripts/livros/classificacao.json`:

```json
{
  "id": "pg-11",
  "classificacao": "livre",
  "revisor": "Guilherme",
  "data": "2026-10-27",
  "nota": ""
}
```

- Valores: `livre`, `12`, `14`, `16`, `18`. Livro fora da lista sai com `classificacao: null` ("a revisar"):
  não aparece para menor; para adulto aparece tudo.
- Quem é menor vem do perfil que já existe (`src/lib/livros/quemLe.ts`): faixa `12-15` vê até `12`, `16-17`
  até `16`, menor de 12 só `livre`; perfil protegido sem faixa (sem conta, idade não declarada) até `12`; o
  perfil de exibição "Infantil" só `livre`.
- **Como revisar:** abra o livro (o detalhe tem "Ver na fonte"), leia o resumo e folheie; na dúvida, não
  classifique (fica "a revisar") ou use a faixa mais alta. Depois de editar a lista, rode a montagem de novo
  (é rápida com o cache) e confira com `--verificar`. O teste `tests/livros-catalogo.test.ts` cobra que a
  classificação do JSON é a da lista.
- **Estado em 26/10/2026:** a lista vem com uma PROPOSTA conservadora (só clássicos infantojuvenis óbvios),
  marcada `"revisor": "proposta-claude"`. Ela vale como está, mas precisa da sua revisão: troque o revisor
  pelo seu nome item a item, ou apague o item.

## 3. A cópia curada do Gutenberg no R2

O Gutenberg não manda CORS, só permite robôs por espelho, e a licença da marca exige que um serviço com
cobrança tire o cabeçalho, o rodapé e o nome do projeto. Por isso o leitor nunca abre o Gutenberg direto: abre
uma cópia nossa, montada uma vez.

```bash
npx tsx scripts/livros/curar-gutenberg.mjs              # monta e confere em data/livros-curados/, não envia
npx tsx scripts/livros/curar-gutenberg.mjs --conferir   # só confere o que já está lá
npx vitest run tests/livros-gutenberg.test.ts           # o mesmo teste varre data/livros-curados/
```

O EPUB é NOVO, montado do texto puro entre os marcadores `*** START`/`*** END` (perde itálico e imagens,
ganha a certeza de que nada da moldura ficou), com uma página de crédito: "Texto de domínio público obtido do
Project Gutenberg." É a única menção ao projeto; a conferência reprova qualquer outra.

**Publicar (decisão do dono; nada foi enviado a bucket real):**

```bash
set -a; source .env; set +a                                   # CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
node scripts/cloudflare/r2.mjs --dry-run                      # mostra: cria frasy-livros(-staging) + CORS GET
node scripts/cloudflare/r2.mjs                                # cria os buckets e o CORS
npx tsx scripts/livros/curar-gutenberg.mjs --enviar --bucket=frasy-livros-staging
```

Depois, no painel da Cloudflare, ligue o acesso público do bucket (domínio próprio, ex. `livros.frasy.com.br`,
ou o `r2.dev`) e defina `VITE_LIVROS_URL` com a raiz pública no build do ambiente (ver
`.env.production.example`). A CSP abre a origem sozinha. Sem a variável, o livro do Gutenberg aparece no
catálogo e a leitura avisa que a cópia ainda não foi publicada.

## 4. A montagem de 26/10/2026

331 livros (277 KB minificado): en 110, pt 70 (50 da Wikisource), es 60, de/fr/it/nl/pl/sv/zh 12 cada, ja 3,
ru 3, he 1; ar, hi, ko e tr ficaram sem livro (o Gutenberg quase não tem, e o que tem não passou no filtro).
Por fonte: Gutenberg 211, Standard Ebooks 70, Wikisource 50. Exclusões registradas (uma por obra): sem autor
38, autor protegido 31, autor sem ano de morte 24, tradutor sem ano de morte 21, tradutor protegido 4,
tradução sem tradutor 4. 8 livros sem nível estimado (verso em português, que não tem lista nem fórmula).

Limites conhecidos: o Standard Ebooks limita downloads por IP (a montagem baixa ~110 EPUBs e depois disso o
navegador da mesma máquina recebeu 429 por um tempo); a mesma obra pode aparecer em duas edições quando a
grafia muda ("Memórias Póstumas" e "Memorias Posthumas"); categorias saem dos assuntos da fonte e erram às
vezes (a revisão manual é a da classificação etária, não a das categorias).

## 5. O que fica para depois

- **"Meus livros" no servidor.** Na L1 a lista mora no `localStorage` e o conteúdo dos livros trazidos no
  IndexedDB, neste aparelho. A sessão `kind:'document'` guardaria o texto inteiro no servidor, o que a spec
  proíbe para livro trazido; a sincronização entra com a tabela de anotações da L2 (posição e grifos, nunca o
  livro).
- **O leitor.** `abrirLivroNoLeitor` (`src/lib/livros/abrir.ts`) leva hoje à leitura provisória
  (`/livros/<id>/ler`). A L2 troca o corpo da função e a tela da rota.
- **Wikidata para todos.** Hoje só o Standard Ebooks e a Wikisource cruzam com a Wikidata; o ano de morte do
  Gutenberg vem do Gutendex. Cruzar também esses (a spec pede para os aprovados) reduz o risco de metadado
  errado.
- **Lista de vocabulário em português** para o nível estimado dos livros em pt.
