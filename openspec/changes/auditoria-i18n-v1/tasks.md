# Tarefas

## Fase 0 — baseline reproduzível (feita)

- [x] 0.1 Confirmar onde vive o trabalho: branch `multi-idioma`, worktree, HEAD `173fcde`, 191
      commits à frente. O checkout principal não tem i18n
- [x] 0.2 Extrair as alegações dos cinco documentos com `arquivo:linha` → `ALEGACOES.md`
- [x] 0.3 Registrar as alegações do briefing **sem fonte no repositório** (704 mil formas→lema,
      desenclítico, US$ 19 mil, "16 idiomas de UI", "2.000 chaves" como fato)
- [x] 0.4 Instalação limpa cronometrada em clone isolado — 842 pacotes, 62 s, exit 0. Não rodada
      no worktree porque `node_modules` é symlink compartilhado com o checkout principal
- [x] 0.5 Rodar todos os gates com tempo e saída: typecheck, lint, test, build, pseudo `--check`,
      `i18n:orfas`, `audit:gate`, `ast-grep test`, `ast-grep scan`, `playwright test`
- [x] 0.6 Oito scripts de medição independentes em `medicoes/`, mais `rodar-tudo.mjs`
- [x] 0.7 Conferir cada medição contra o que o próprio repo imprime; registrar divergência como
      dado, não reconciliar em silêncio
- [x] 0.8 Tabela alegado × medido × delta → `FASE-0-baseline.md`
- [x] 0.9 `medicoes/COMANDOS.md` com o comando literal de cada medida e as ressalvas de método

### Correções feitas nos meus próprios scripts durante a fase

- [x] 0.10 `<T` casava com genérico do TypeScript (`<T>` em `trilha.ts:101`, `<T,>` em
      `Analysis.tsx:722`): 45 viraram **8** ao exigir uma prop
- [x] 0.11 A versão da trilha não distingue v1 de v2 — `en.json` grava `versao` como a string
      `"1.5+1.0+trad.2+frases.1"`. E o inglês **mistura** tuplas de 4 campos (2.552) com de 2
      campos (232), então nem o tamanho item a item serve. Sem isso o inglês aparecia com 100%
      de frase em vez de 91,7%
- [x] 0.12 O regex de rotas pegava comentário e devolvia 6 onde há 10; passou a ler o mapa
      `SEGMENTO`

## GATE 0 — aguardando aceite humano

Entregue: `FASE-0-baseline.md`, `ALEGACOES.md`, `medicoes/`. Nada foi commitado.

- [ ] G0.1 Aceite da tabela baseline
- [ ] G0.2 Decidir se o change precisa de `specs/` no molde completo da casa
- [ ] G0.3 Decidir se os arquivos da auditoria entram em commit agora ou ao fim

## Fase 1 — verificação alegação por alegação (feita)

- [x] 1.1 Veredito para cada linha de `ALEGACOES.md` → `FASE-1-verificacao.md`
      (41 CONFIRMADO · 12 PARCIAL · 4 REFUTADO · 6 NÃO VERIFICÁVEL)
- [x] 1.2 Medir o que a Fase 0 deixou fora → medição 09: 80 plurais no código (alegado 78),
      1.196 template literals, 1.181 tags inline, 70 chaves `babel.*`
- [x] 1.3 Provar que o gate de publicação reprova, com fixture deliberadamente ruim → reprova
      (`ja` 30% fora da escrita, `zh` 2% de glosa, exit 1). E revelou que `tr` passa com 50%
      porque escrita latina não está em `ESCRITA_DO_IDIOMA`
- [x] 1.4 Intervalo de confiança da amostra de 60 → 90% ±7,7 pp (Wilson); n=385 para ±3 pp.
      A melhora 70%→90% É significativa em teste pareado (McNemar p=0,0005)
- [x] 1.6 Falso positivo do desenclítico → 15/16 casos nomeados corretos; 0 palavras cortadas no
      vocabulário real de `es` e `it`
- [x] 1.7 Auditar `<T>` quanto a HTML cru → nenhum caminho. Não é P0
- [x] 1.8 `?ui=` valida o parâmetro? → **não**. Busca caminho arbitrário de mesma origem,
      envenena `document.lang` e faz os formatadores lançarem `RangeError`
- [x] 1.9 (extra) Normalização NFC/NFD ingestão × runtime → consistente, 0 colisões
- [x] 1.10 (extra) Régua de palavras × `Intl.Segmenter` → erro de −17,2% em japonês
- [x] 1.11 (extra) Idioma das frases do Tatoeba → 0 fora da escrita, nos 16 idiomas

### Ficou para depois

- [ ] 1.5 Amostrar lemas por família tipológica — `formasPorLema` busca o mapa por SPARQL no
      Wikidata, em rede; não é reproduzível offline. Precisa de decisão sobre bater na rede

## GATE 1 — aguardando aceite humano

Entregue: `FASE-1-verificacao.md`, medições 09 a 12, `evidencias/ui-param/`. Nada commitado.

- [ ] G1.1 Aceite dos vereditos
- [ ] G1.2 Decidir se a auditoria pode bater na rede (Wikidata/Tatoeba) para fechar 1.5
- [ ] G1.3 Decidir se N3 (`?ui=`) sobe para tratamento imediato ou espera a Fase 7

## Fase 2 — censo de cobertura (feita)

- [x] 2.1 Censo por área e por tela → `FASE-2-cobertura.md`. Cobertura global 12%–23% conforme o
      denominador; `views/` em 30,9%
- [x] 2.2 Superfícies esquecidas → 292 atributos (`aria-label`/`title`/`placeholder`/`alt`) com
      8 traduzidos = **2,7%**
- [x] 2.3 Strings do servidor → **98** mensagens literais e `server/` **não importa** `lib/i18n`:
      não há caminho de tradução, e duas delas são de paywall
- [x] 2.4 `<title>` e meta tags → estáticas em português para todo idioma
- [x] 2.5 Gap classificado por esforço e risco (G1 a G9)
- [x] 2.6 (achado) Telas de dinheiro e porta de entrada em **1,4%** contra 30,9% das de prática

## Fase 3 — estresse por escrita (feita)

- [x] 3.1 Matriz idioma × escrita × status → `FASE-3-escritas.md`
- [x] 3.2 Turco: **1.996 de 5.787** palavras (34,5%) mudam de identidade com `toUpperCase()`
      invariante → **QUEBRADO**
- [x] 3.3 Ordenação: `Intl.Collator` diverge da binária em is/sv/tr/de nos 4 casos testados
- [x] 3.4 Cluster de grafema: `.length` erra 3,5× em devanágari; censo de 58 `.slice(0,N)`
- [x] 3.5 Chinês: `zh-CN` e `zh-TW` colapsam na mesma trilha, que é 98,6% simplificada
- [x] 3.6 Fontes: **zero** arquivo de fonte, nenhuma família cobre escrita não latina
- [x] 3.7 Árabe em navegador: `dir=rtl` funciona; **0 elementos `<bdi>`** e 69 blocos de texto
      latino em contexto RTL → pontuação reordenada (`evidencias/ar/`)
- [x] 3.8 Pseudo-localização: 0 estouros (o e2e está certo); revela strings fora do `t()`, mas o
      check que as detecta só relata e não falha

## Fases 4 a 7 — NÃO EXECUTADAS

Interrompidas para integrar `multi-idioma` em `main`. Sem elas a auditoria não tem veredito.

- [ ] 4 Arquitetura contra o padrão da indústria (ICU MessageFormat, chaves estáveis, XLIFF/PO,
      TMS, BCP-47 e negociação de idioma, ferramentas de lint prontas)
- [ ] 5 Performance e custo (projeção com 16 catálogos, tempo de CI, custo de tradução refeito
      com a contagem medida)
- [ ] 6 Segurança e licenciamento (**CC BY-SA do Wikcionário — atribuição obrigatória**, CC BY do
      Tatoeba, varredura Trojan Source/bidi, conteúdo impróprio, LGPD do Google Fonts)
- [ ] 7 Veredito, achados priorizados P0–P3 e sequência recomendada
