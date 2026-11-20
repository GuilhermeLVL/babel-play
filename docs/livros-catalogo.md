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
- **O ano.** O padrão é o ano civil em America/Sao_Paulo (a virada do domínio público é 1º de janeiro no
  Brasil, não em UTC). No CI, `--ano` é obrigatório.
- **Filtro legal** (`src/core/livros/filtroLegal.ts`, coberto por `tests/livros-filtro-legal.test.ts`): entra
  só quem tem todos os autores e tradutores com ano de morte até `ano − 71`. Sem ano de morte, fora.
- **Tradução, com falha fechada** (`ehTraducao`). É tradução quando há tradutor, quando a fonte ou o texto
  dizem que é ("translated by", `trl` no OPF, P655 na Wikidata), e quando NÃO DÁ PARA CONFIRMAR que cada autor
  escrevia no idioma do livro. Os idiomas de cada autor vêm da Wikidata (P6886 idioma de escrita, P1412, P103),
  gravados no JSON em `autores[].idiomas`. No Gutenberg a pessoa é achada pelo nome e só vale o candidato com o
  mesmo ano de morte (e de nascimento, quando há); no Standard Ebooks, pelo link da Wikipedia do OPF; na
  Wikisource, pelo P50 da obra. Sem idioma conhecido, é tradução; tradução sem tradutor identificado, fora.
  Quando a Wikidata não decide, `scripts/livros/idiomas-de-autor.json` é a lista manual (nome → idiomas).
- **Wikisource e o P655.** Tradutor ligado à obra na Wikidata (P655) conta como tradução declarada, mesmo
  quando o texto em português é o original e o tradutor é de uma versão para outro idioma (caso de "Memórias
  Póstumas", que tem o tradutor da edição inglesa). É o lado seguro do erro; a obra costuma ficar no catálogo
  pela edição do Gutenberg.
- **Conferência.** No fim o script confere cada livro de novo, com a MESMA regra, e não grava nada se um violar;
  `--verificar` faz só essa conferência no JSON publicado. O cliente refaz o filtro (defesa dupla) com o
  ano-limite mais restritivo entre o publicado e `ano em São Paulo − 71`, e com a regra da tradução.
- **Exclusões.** Todo livro que a fonte tem e o filtro recusou vai para `exclusoes` com o motivo. É o que a
  tela usa para responder "por que este livro não está?".
- **Nível estimado** (`src/core/livros/nivelEstimado.ts`): cobertura das listas CEFR de
  `src/data/trilha/niveis/<idioma>.json` (o menor nível em que as palavras conhecidas somam 90% das
  conhecidas) e fórmula de legibilidade (Flesch-Kincaid no inglês, Fernández-Huerta no espanhol, Flesch de
  Martins et al. no português), mediana de até 24 amostras de 1000 palavras. Verso e teatro usam só a
  cobertura. O português não tem lista na trilha e usa só a fórmula, que é a medida mais fraca do catálogo.
- **Exceções** (`scripts/livros/excecoes.json`): obra anônima ou coletiva só entra com justificativa escrita
  por item (os autores da exceção precisam trazer `idiomas`). Começa vazia.
- **Direitos declarados.** Os "COPYRIGHTED Project Gutenberg Etext" (o projeto distribuía algumas obras
  protegidas com permissão) são recusados com o motivo `direitos-declarados-na-fonte`.

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

- Valores: `livre`, `12`, `14`, `16`, `18`. Qualquer outro valor PARA a montagem; no cliente, um valor
  desconhecido vira `null`. Livro fora da lista sai com `classificacao: null` ("a revisar"): não aparece para
  menor; para adulto aparece tudo.
- **Só vale o item com revisor de pessoa.** `"revisor": "proposta-claude"` (ou sem revisor) sai `null`: a
  proposta fica no arquivo para você aprovar, e menor não vê nada dela até lá. `--verificar` acusa proposta
  publicada com classificação.
- Quem é menor vem do perfil que já existe (`src/lib/livros/quemLe.ts`): faixa `12-15` vê até `12`, `16-17`
  até `16`, menor de 12 só `livre`; perfil protegido sem faixa (sem conta, idade não declarada) até `12`; o
  perfil de exibição "Infantil" só `livre`.
- **Como revisar:** abra o livro (o detalhe tem "Ver na fonte"), leia o resumo e folheie; na dúvida, não
  classifique (fica "a revisar") ou use a faixa mais alta. Depois de editar a lista, rode a montagem de novo
  (é rápida com o cache) e confira com `--verificar`. O teste `tests/livros-catalogo.test.ts` cobra que a
  classificação do JSON é a da lista.
- **Estado em 26/10/2026:** a lista vem com uma PROPOSTA conservadora (só clássicos infantojuvenis óbvios),
  marcada `"revisor": "proposta-claude"`, e por isso NADA está liberado para menor ainda: a tela do menor diz
  que os livros da idade dele estão em revisão e oferece "Trazer o seu". Para aprovar, troque o revisor pelo
  seu nome (e a data) item a item, ou apague o item; depois rode a montagem e `--verificar`.

## 3. A cópia curada do Gutenberg no R2

O Gutenberg não manda CORS, só permite robôs por espelho, e a licença da marca exige que um serviço com
cobrança tire o cabeçalho, o rodapé e o nome do projeto. Por isso o leitor nunca abre o Gutenberg direto: abre
uma cópia nossa, montada uma vez.

```bash
npx tsx scripts/livros/curar-gutenberg.mjs              # monta e confere em data/livros-curados/, não envia
npx tsx scripts/livros/curar-gutenberg.mjs --conferir   # só confere o que já está lá
npx vitest run tests/livros-gutenberg.test.ts           # o mesmo teste varre data/livros-curados/
```

O EPUB é NOVO, montado do texto puro entre os marcadores `*** START`/`*** END` (ou, no formato antigo, depois
da linha `*END*THE SMALL PRINT! … *END*`), com uma página de crédito: "Texto de domínio público obtido do
Project Gutenberg." É a única menção ao projeto; a conferência reprova qualquer outra.

**O preço do corte, escolhido de propósito:**

- perde-se a formatação rica (itálico, imagens, notas): o EPUB é refeito do texto puro;
- toda LINHA do miolo que cite o projeto (`Project Gutenberg`, `gutenberg.org`, `Gutenberg-tm`, `SMALL
PRINT`…) é tirada inteira, inclusive a que for texto da obra (um romance que fale do "Project Gutenberg");
- o primeiro bloco "Produced by…/Transcribed by…" do topo sai inteiro, até a linha em branco, e com ele o que
  estiver colado nele (a nota do transcritor, às vezes);
- a contagem fica no log (`linhas da moldura tiradas`) para quem quiser conferir um livro.

Os testes rodam sobre molduras REAIS do espelho, recortadas (`tests/fixtures/livros/gutenberg/`): um `-8.txt`
em latin-1 com o crédito do Proyektong Gutenberg ng Pilipinas, outro `-8.txt` espanhol, um `-0.txt` moderno e
o formato antigo "SMALL PRINT!" (o único exemplar real que o espelho ainda serve é um etext COM direitos, o
1619, que é recusado; o caso de domínio público usa a mesma moldura com a frase de direitos trocada).

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

328 livros: en 110, pt 70 (50 da Wikisource), es 60, de/fr/it/nl/pl/sv/zh 12 cada, ja 2, ru 1, he 1; ar,
hi, ko e tr ficaram sem livro (o Gutenberg quase não tem, e o que tem não passou no filtro). Por fonte:
Gutenberg 208, Standard Ebooks 70, Wikisource 50; 49 com tradutor identificado. Exclusões registradas (uma
por obra): tradução sem tradutor 60 (a regra do idioma do autor, nova nesta montagem), sem autor 41, autor
protegido 33, autor sem ano de morte 27, tradutor sem ano de morte 23, tradutor protegido 6, direitos
declarados na fonte 1. 6 livros sem nível estimado. Nenhuma classificação publicada: a lista só tem propostas.

Limites conhecidos: o Standard Ebooks limita downloads por IP (a montagem baixa ~110 EPUBs e depois disso o
navegador da mesma máquina recebeu 429 por um tempo); a mesma obra pode aparecer em duas edições quando a
grafia muda ("Memórias Póstumas" e "Memorias Posthumas"); categorias saem dos assuntos da fonte e erram às
vezes (a revisão manual é a da classificação etária, não a das categorias).

## 5. O que fica para depois

- **"Meus livros" no servidor.** Na L1 a lista mora no `localStorage` e o conteúdo dos livros trazidos no
  IndexedDB, neste aparelho. A sessão `kind:'document'` guardaria o texto inteiro no servidor, o que a spec
  proíbe para livro trazido; a sincronização entra com a tabela de anotações da L2 (posição e grifos, nunca o
  livro). No aparelho cabem 30 livros e 150 MB de conteúdo; ao passar, sai o conteúdo do aberto há mais tempo
  (a entrada fica na lista, e abrir pede o arquivo de novo) e a tela diz quais saíram. Na memória da aba ficam
  só os 2 mais recentes. Para perfil protegido, os guardados do catálogo que ele não pode ver somem da lista.
- **O leitor.** `abrirLivroNoLeitor` (`src/lib/livros/abrir.ts`) leva hoje à leitura provisória
  (`/livros/<id>/ler`). A L2 troca o corpo da função e a tela da rota.
- **Ano de morte do Gutenberg pela Wikidata.** O idioma do autor já vem da Wikidata (e o candidato só vale com
  o mesmo ano de morte do Gutendex); o ano de morte do
  Gutenberg vem do Gutendex. Cruzar também esses (a spec pede para os aprovados) reduz o risco de metadado
  errado.
- **Lista de vocabulário em português** para o nível estimado dos livros em pt.
