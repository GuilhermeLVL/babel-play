# REA x LingQ: relatório

## Como o REA foi usado

- Pacote `rea-agents` 6.10.1 (MIT), instalado SÓ em `.../scratchpad/rea/runner` (npm local; nada global, `setup` NÃO rodado, ~/.claude intocado).
- Falha 1: `npx -y rea-agents@latest ...` -> "REA requires Node.js 22.x (>=22.23.4), 24.x (>=24.22.1)...; this process runs 24.22.0". Contorno (não repetição da mesma abordagem): `npm i node@22 rea-agents` no diretório local e wrapper `.../scratchpad/rea/rea.sh` que põe o node 22.23.5 local no PATH.
- Comando que funcionou: `rea.sh analyze-javascript-application <dir com os JS públicos> --json` (exit 0, 4,2 MB de Evidence em `rea/lingq/rea-app.json`).
- `analyze-web-bundle` exige navegador com CDP em loopback (endpoint + targetId); não usado (sem login possível, e o shell público não carrega o app).

## Evidências por método

**REA (análise estática do JS público):** só os 2 bundles `static/CACHE/js/output.*.js` (home e login, 8 KB e 1,3 KB: polyfill de Promise, font loader, menu burger, troca de idioma via POST `/change-language/`). Nenhum dado de vocabulário/revisão/atalhos/flags. O app logado (`/en/learn/en/web/...`) redireciona para `/en/accounts/login/`; o bundle `lynx-<hash>.js` é um stub de 163 bytes (webpack, chunk 584 vazio) e o JS real só é servido após login. Não tentei contornar. Conclusão: REA funciona, mas o alvo público não tem o que extrair.
**Análise manual leve (curl + gh + busca web), por fonte:**

- Páginas públicas (curl): home, /duolingo-alternative, /ios-app, sitemap, robots.
- Clientes de terceiros no GitHub (leitura de código público de modelos de API, só fatos de dados): daxida/lingq (`models/cards.py`, `lesson_v3.py`, `language.py`), thags/lingqAnkiSync (`LingqApi.py`, `Converter.py`, readme).
- Fórum/ajuda oficiais (WebFetch/WebSearch): fórum.lingq.com atalhos do leitor; lingq-support.groovehq.com; thread de moedas.

## Achados

### Modelo de dados (API v3 `/api/v3/{lang}/cards/`, via clientes de terceiros)

Card (LingQ): `pk, term, fragment` (frase de contexto), `importance` (ranking próprio), `status` 0-3 + `extended_status`, `notes`, `audio`, `words[]`, `tags[]`, `g_tags` (tags gramaticais automáticas), `word_tags`, `hints[]`, `transliteration`, `readings`, `writings`, datas de revisão/`srs_due_date`.

- Status exibido: 0=1 Novo, 1=2 Reconhecida, 2=3 Familiar, 3=4 Aprendida; status 3 + extended_status 3 = 5 "Conhecida". Ignorar é separado (tecla x). Conhecidas (4 e 5) contam em "known words"; "Aprendida" ainda entra na SRS, "Conhecida" não.
- Hint (tradução): `text, locale, popularity, is_google_translate, flagged` (traduções populares votadas, sinalizáveis).
- Filtro de API: `status=0..3` repetido (excluir conhecidas). Paginação `page_size` até 1000.
- Língua: `known_words` por idioma. Lição: `word_count, unique_word_count, new_words_count, difficulty, percent_completed, read_times, listen_times, cards_count, level, tags, is_favorite, tokenized_text` (tokens com `word_id`, timestamps por frase), `translation` por sentença, `video_url`, `locked reasons`: NORMALIZE_AUDIO, GENERATE_TIMESTAMPS, TRANSCRIBE_AUDIO, TOKENIZE_TEXT (pipeline de IA na importação). Endpoints: `lessons/counters`, `lessons/import/`, `search/`, `collections`.
- Mapeamento Anki conhecido (thags): níveis 1/2/3/4/conhecida ~ intervalos 0/5/13/34/85 dias.

### Lista de vocabulário

Filtros: por tag, status, curso, lição, data de vencimento SRS. Ordenação: alfabética, reversa, data de criação, status, importância (botão Apply). Fonte: fórum/ajuda; incompleto.

### Revisão

SRS com 5 atividades (blog oficial citado na busca): flashcards, flashcards reversos, cloze, ditado, múltipla escolha. Acertar 2 vezes seguidas sobe 1 status. Revisão pode ser feita dentro da lição ou na página de vocabulário, com filtro.

### Estatísticas / metas

Moedas: criar LingQ 1-4; adicionar conhecida 5-20 (por valor/raridade da palavra); subir status 1-4; ler 1 por 10 palavras; ouvir 300/h (5/min) no leitor/playlist (escuta manual não conta); escrita/tutor não. Meta diária em moedas; atingi-la mantém a streak; reparar streak custa 5.000 moedas. Cor da moeda = esforço nos últimos 30 dias por idioma. Estatísticas: palavras conhecidas, horas de escuta/leitura, LingQs criados.

### Atalhos do leitor (web, fórum oficial)

Setas esq/dir palavra marcada anterior/próxima; Shift+setas página; b próxima palavra azul (nova); 1-4 status; k conhecida; x ignorar; f/d dicionário externo; s áudio da palavra; cima/baixo navega significados; t tag; h criar e focar significado manual; e salvar significado e abrir dicionário; Shift+f sinalizar significado; Shift+Espaço sidebar; Esc fecha. Modo frase: a áudio da frase, Shift+t tradução. Player: Espaço play/pause, Alt+n volta n s, Shift+>/< ±5 s. Fonte: +/-.

### Feature flags

Nenhuma encontrada (JS público não as contém).

### Ideias para o Frasy (funcionalidade/UX, sem copiar)

Palavra azul/estado novo + status 1-4 + conhecida separada de ignorada; frase de contexto guardada com o termo; traduções votadas pela comunidade; meta diária em "esforço" unificado (ler/ouvir/estudar) em vez de só contagem; reparo de streak; pipeline de importação com estados (transcrever, tokenizar, timestamps).

## Limitações

- Nada do app logado foi analisado (sem login, sem burlar). Atalhos/moedas/filtros vêm de fórum, ajuda e clientes de terceiros (podem estar defasados). Campos de estatísticas detalhadas e opções de meta diária não confirmados.
- Alvo secundário (Language Reactor, Readlang) não analisado.
- robots.txt do LingQ proíbe /api/ e /apidocs: não acessei a API, só li código público de terceiros.
