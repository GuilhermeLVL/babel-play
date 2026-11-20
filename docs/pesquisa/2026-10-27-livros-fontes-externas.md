# Trazer livros de fora: fontes externas, links e direitos autorais

Data: 2026-10-27. Autor: pesquisador (Claude). Isto é pesquisa técnica, NÃO parecer jurídico: antes de lançar, um advogado de propriedade intelectual/digital deve revisar as seções 3 e 5.

Convenção: **[V]** = verificado em fonte primária nesta pesquisa; **[S]** = só fonte secundária ou conhecimento geral, a confirmar; **[?]** = não confirmado.

## 1. Resumo executivo (recomendação)

1. Três camadas: VERDE integra direto (catálogo, busca, OPDS); AMARELO vira guia mais "traga seu arquivo"; VERMELHO não recebe nem link.
2. **Z-Library e similares (Anna's Archive, LibGen etc.): NÃO linkar, NÃO guiar, NÃO citar por nome em tela nem em guia.** Para um app com menores de 12 a 17 anos, o risco (jurídico, reputação, lojas/anunciantes/AdSense, malware) não compensa o ganho.
3. **Amazon/Kindle: NÃO ensinar remoção de DRM** (LDA art. 107 [V]; DMCA 1201 [S]). Oferecer só: "traga um arquivo seu sem DRM" (EPUB/PDF/TXT de loja sem DRM, de autor, de domínio público) e orientar a procurar a edição sem DRM ou o catálogo legal. Sem importação do Kindle (não achei API aberta [?]).
4. **GitHub: aceitar URL/arquivo escolhido pelo usuário**, com aviso de direitos, sem catalogar nem indexar repositórios de livros por conta própria. Raw/Release só com licença visível (LICENSE/README) ou em lista curada.
5. **Importar do dispositivo (arrastar e soltar, "Abrir com") é a via principal sem atrito**: o arquivo não passa pelo servidor (coerente com retenção zero e com a importação já feita no navegador).
6. VERDES: Project Gutenberg, Standard Ebooks, Wikisource, Wikibooks, Open Library (metadados), Internet Archive (só itens de domínio público/licença aberta), LibriVox (áudio).
7. AMARELO: HathiTrust, Domínio Público/MEC, Biblioteca Nacional/Brasiliana, Feedbooks, Faded Page, Biblioteca Digital Mundial, ManyBooks. Checar obra a obra (70 anos pós-morte no Brasil e direitos do tradutor).
8. Cliente OPDS embutido vale como extra opcional, mas o gargalo é CORS e a política de cada catálogo; comece pelos catálogos que já temos no servidor/R2.
9. Aviso de direitos curto, sem prometer legalidade (seção 5), na primeira importação e sempre ao colar URL.
10. Não registrar no servidor o que o usuário importa; manter canal de denúncia/retirada para o que estiver no nosso catálogo.

## 2. Fontes: semáforo

| Fonte                                         | Semáforo          | Licença/termos                                                                                                                                  | API/OPDS                                                                                                            | CORS/uso                                                                                                                       | Observações                                                                |
| --------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Project Gutenberg                             | VERDE             | Domínio público nos EUA; dados do catálogo em DP [V]; a marca tem regras [S]                                                                    | Catálogo legível por máquina [V]; OPDS [S]                                                                          | Política de robôs [V]: site é para humanos, automação pode bloquear o IP; recomenda espelho privado ou /robot/harvest com -w 2 | Base do nosso R2 de staging. "DP nos EUA" não é igual a DP no Brasil (3.1) |
| Standard Ebooks                               | VERDE             | Manual em CC0 [V]; edições em LICENSE.md de cada ebook (não lido) [?]                                                                           | OPDS 1.2/2.0; só o feed de novidades é aberto, os demais exigem Patrons Circle (doação) ou critério open source [V] | CORS [?]                                                                                                                       | Qualidade alta, poucos títulos, quase todos em inglês                      |
| Wikisource                                    | VERDE             | Texto sob CC BY-SA [S]; obra em DP por regra de cada edição                                                                                     | MediaWiki Action API; CORS anônimo com origin=\* [V]                                                                | Direto do navegador [V]; política de User-Agent da Wikimedia [?]                                                               | Nem sempre há EPUB pronto; exportação existe [S]                           |
| Wikibooks                                     | VERDE             | CC BY-SA [S]                                                                                                                                    | Mesma API                                                                                                           | Direto [V]                                                                                                                     | Didático, não literatura                                                   |
| Open Library                                  | VERDE (metadados) | Política de API [V]: 1 req/s anônima, 3 req/s com User-Agent com contato; proibido baixar em massa (usar dumps); licença dos dados não lida [?] | search.json, works, covers                                                                                          | CORS não consta na doc [?]; chamar pelo servidor com cache                                                                     | Não integrar o "empréstimo" (não é DP)                                     |
| Internet Archive                              | VERDE com filtro  | Licença por item; aceitar só licenseurl aberta ou DP comprovado                                                                                 | Advanced search, metadata API                                                                                       | Termos de uso programático e CORS [?]                                                                                          | Excluir coleções de empréstimo controlado                                  |
| LibriVox                                      | VERDE (áudio)     | Gravações dedicadas ao DP [S]                                                                                                                   | API/RSS [S]                                                                                                         | [?]                                                                                                                            | Textos-base podem ser DP só nos EUA                                        |
| HathiTrust                                    | AMARELO           | "Full view" varia por país; só secundária [S]                                                                                                   | API bibliográfica [S]                                                                                               | [?]                                                                                                                            | Muitos itens "DP só nos EUA"; acesso do Brasil [?]                         |
| Domínio Público (MEC)                         | AMARELO           | DP ou divulgação autorizada, às vezes só não comercial [S]; termos oficiais não achados [?]                                                     | Sem API                                                                                                             | Sem CORS                                                                                                                       | Sucessor "MEC Livros" pode exigir login gov.br [S]. Tratar como guia       |
| BN / Brasiliana / BNDigital                   | AMARELO           | Mistura de DP e acervo restrito [?]                                                                                                             | [?]                                                                                                                 | [?]                                                                                                                            | Ótimo para PT-BR histórico; item a item                                    |
| Biblioteca Digital Mundial                    | AMARELO           | Termos por item [?]                                                                                                                             | [?]                                                                                                                 | [?]                                                                                                                            | Ver se o serviço segue ativo                                               |
| Feedbooks                                     | AMARELO           | Parte DP (regra francesa/canadense), parte comercial [S]                                                                                        | OPDS [S]                                                                                                            | [?]                                                                                                                            | Status atual [?]                                                           |
| ManyBooks                                     | AMARELO           | DP + autores indies com licenças próprias [S]                                                                                                   | Sem API oficial [?]                                                                                                 | [?]                                                                                                                            | Licenças variadas                                                          |
| Faded Page (Canadá)                           | AMARELO, alerta   | DP no CANADÁ (autor morto há 70+ anos; era 50 até 2023) [V]; o site manda checar a lei local fora do Canadá [V]                                 | Sem API [?]                                                                                                         | [?]                                                                                                                            | Autor morto entre 1925 e 1955 pode ser DP lá e não no Brasil. Só guia      |
| Mundo Ebooks, Casa do Saber, "Livros Abertos" | AMARELO/VERMELHO  | Licença clara não verificada [?]                                                                                                                | -                                                                                                                   | -                                                                                                                              | Só se publicarem licença por obra                                          |
| Z-Library, Anna's Archive, LibGen e espelhos  | VERMELHO          | Pirataria                                                                                                                                       | -                                                                                                                   | -                                                                                                                              | Seção 3                                                                    |

## 3. Riscos jurídicos

### 3.1 Fontes legais

Risco baixo. Cuidados: prazo brasileiro de 70 anos contados de 1º de janeiro do ano seguinte à morte (LDA art. 41 [V]); quem traduz/adapta obra em DP tem direito autoral sobre a sua versão (art. 14 [V]). "DP no Gutenberg" não implica "DP no Brasil" nem "DP nesta tradução".

### 3.2 Pirataria (Z-Library e similares)

**Verificável [V, DOJ]:** em novembro de 2022 a promotoria federal do distrito leste de NY divulgou acusação de violação criminal de direito autoral, fraude eletrônica e lavagem de dinheiro contra dois russos, presos na Argentina a pedido dos EUA; cerca de 249 domínios foram apreendidos. São alegações. Andamento atual e extradição [?]. Fontes secundárias: o serviço voltou com subdomínios por usuário; tribunal de Paris mandou bloquear 98 domínios em 2024 [S]. Não achei bloqueio brasileiro [?].

**Brasil** (a confirmar com advogado):

- LDA art. 104 [V]: quem vende, expõe à venda, distribui, armazena ou utiliza obra fraudulentamente reproduzida, para proveito ou lucro, responde solidariamente com o contrafator. O app tem anúncios e planos pagos, o que enfraquece "sem lucro".
- LDA art. 107 [V]: indenização para quem remove medidas técnicas (DRM) ou distribui obra sabendo disso.
- Código Penal art. 184: texto NÃO conferido [?]; confirmar no Planalto antes de citar.
- Marco Civil art. 19 [V]: provedor de aplicação só responde por conteúdo de terceiros após ordem judicial específica, mas o §2º remete direitos autorais a lei específica, mantendo as regras autorais vigentes [V]. Isso protege o que o USUÁRIO publica; não protege uma curadoria nossa que indica o site pirata. Art. 21 (imagens íntimas) não se aplica.
- Responsabilidade de quem induz/auxilia: não encontrei precedente brasileiro sobre "link para site pirata de livros" [?]. Não cito jurisprudência que não confirmei.

**UE (só comparação)** [S, sentenças não lidas]: GS Media (C-160/15) condiciona a responsabilidade por link ao conhecimento (ou dever de conhecer) de que a publicação foi sem consentimento, presumido quando o link é posto com fins lucrativos; Filmspeler (C-527/15) e Ziggo/The Pirate Bay (C-610/15) tratam como comunicação ao público quem fornece dispositivo ou índice organizado que dá acesso a obras ilícitas. Uma curadoria com fins lucrativos que sabe que o destino é pirata cai no pior quadrante.

**EUA/DMCA** [S, não consultado]: seção 512 (safe harbor com notificação e retirada, não cobre quem sabe da infração) e 1201 (circunvenção de DRM). Se houver usuários nos EUA, avaliar agente DMCA registrado.

**Conclusão prática:** app para menores NÃO deve linkar nem guiar para pirataria. Além do jurídico: ECA Digital/LGPD elevam o dever de cuidado; AdSense e lojas de apps restringem conteúdo que facilite infração [S]; esses sites são vetor de malware e phishing [S].

### 3.3 Amazon/Kindle

- Kindle comprado tem DRM. Removê-lo viola LDA art. 107 [V] e DMCA 1201 [S]. O app não ensina nem linka ferramentas de DeDRM.
- Legítimo: (a) arquivos próprios sem DRM (editoras que vendem sem DRM, DP, obras do próprio usuário); (b) orientar a buscar a edição sem DRM ou a versão DP; (c) amostra da loja, lida na loja (não importável); (d) "Enviar para o Kindle" é fluxo da Amazon para ler no Kindle, não nos serve.
- APIs: não achei importação aberta do Kindle [?]. Open Library: metadados, regras acima [V]. Google Books API: só metadados/prévia; termos atuais NÃO verificados [?]. A proibição de Gemini/IA do Google não cobre essa API, mas registre decisão do dono e revise os termos quanto a menores.

### 3.4 GitHub

- ToS [V]: não restringe acesso lícito a repositórios públicos; abuso da API leva à suspensão; reincidentes em infração têm a conta encerrada; há processo de DMCA. Nada específico sobre raw.githubusercontent.com encontrado [?]: usar com cache e baixo volume.
- Licença: arquivo LICENSE/COPYING, licença exibida pela API, README. Sem licença NÃO é uso livre.
- Riscos: repositórios de ebooks piratas (sujeitos a DMCA) e listas "awesome" com links para sites piratas. Não indexar GitHub como fonte curada.
- Forma segura: campo "Colar link" para release/raw, checando tipo (EPUB/PDF/TXT) e tamanho, baixando no navegador do usuário (CORS de raw/releases [?]; se faltar, proxy anti-SSRF sem armazenamento) e exibindo o aviso da seção 5.

## 4. UX: ir ao provedor e voltar

Comparativo (conhecimento geral [S], produtos não testados): Kobo/Kindle usam loja própria e sideload; Moon+ Reader abre arquivos locais e catálogos OPDS cadastrados pelo usuário, sem curadoria; Calibre-Web serve a biblioteca própria com OPDS; Readwise Reader importa por URL, e-mail e extensão, focado em material do próprio usuário.

Para o Frasy, por valor/esforço:

1. **Arrastar e soltar / escolher arquivo** (zero servidor).
2. **"Abrir com" no PWA:** File Handling API (file_handlers no manifest, Chromium desktop) e Web Share Target (Android/Chromium); Safari/iOS [?]. Melhoria progressiva.
3. **Colar URL** (release/raw/Gutenberg/Standard Ebooks): baixa no navegador e importa.
4. **Catálogo embutido** das fontes VERDES com "Ler" sem sair do app.
5. **Guia "Como trazer seu livro"**: onde achar livros de DP (links VERDES/AMARELOS), salvar e importar.
6. **Retorno:** não controlamos a fonte, então não há deep link garantido. Fluxo realista: link abre outra aba, o usuário baixa, volta; mostrar "Depois de baixar, arraste o arquivo para cá" e abrir o seletor ao voltar à aba.

## 5. Aviso de direitos sugerido

> **Traga só o que você pode ler.** Os livros que você importa ficam no seu aparelho e não são enviados para nós. Use arquivos que você comprou sem proteção, que são de domínio público ou que o autor liberou. O Frasy não confere a origem do arquivo e não indica sites que distribuem cópias sem autorização. Se algo do nosso catálogo for seu e não deveria estar aqui, avise em [e-mail] e retiramos.

Evitar "100% legal", "livre de direitos", "domínio público garantido". No catálogo, mostrar origem e licença de cada obra ("Domínio público, fonte: Project Gutenberg"). Versão em linguagem simples para menores; consentimento fica nos termos de uso e com os responsáveis.

## 6. Recomendação em 3 camadas

**Incluir agora (VERDE):** catálogo e busca de Gutenberg, Standard Ebooks (downloads individuais), Wikisource/Wikibooks, Open Library (metadados via servidor, com User-Agent e cache), Internet Archive (filtro estrito de licença), LibriVox; importação por arrastar, "Abrir com" e colar URL; aviso de direitos; canal de denúncia.

**Só guia (AMARELO):** Domínio Público/MEC, BN/Brasiliana, HathiTrust, Faded Page, Feedbooks, ManyBooks, Biblioteca Digital Mundial; texto "como conferir se é DP no Brasil (70 anos, tradutor)" e "traga seu arquivo".

**Não fazer (VERMELHO):** linkar, citar ou ensinar Z-Library, Anna's Archive, LibGen e espelhos; ensinar remoção de DRM; usar listas "awesome" de pirataria; raspar sites sem termos claros; guardar arquivos do usuário no servidor; prometer "importar da Amazon".

**OPDS embutido:** vale depois do catálogo próprio. Ser cliente genérico é legal em si, mas transfere ao usuário a escolha do catálogo; sugerir só catálogos VERDES, com o aviso. CORS é a limitação prática; usar proxy sem armazenamento.

## 7. Links consultados (acesso em 2026-10-27)

- Gutenberg, robôs: https://www.gutenberg.org/policy/robot_access.html
- Standard Ebooks, manual: https://standardebooks.org/manual/latest/single-page
- Standard Ebooks, feeds: https://standardebooks.org/feeds
- DOJ EDNY, Z-Library: https://www.justice.gov/usao-edny/pr/two-russian-nationals-charged-running-massive-e-book-piracy-website
- Korben (secundária): https://korben.info/en/z-library-2026-fbi-failed-to-kill-it.html
- Tecnoblog (secundária): https://tecnoblog.net/noticias/rinha-de-bibliotecas-as-copias-do-z-library-estao-brigando-entre-si/
- Open Library API: https://openlibrary.org/developers/api
- Lei 9.610/98: https://www.planalto.gov.br/ccivil_03/leis/l9610.htm
- Marco Civil: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm
- Código Penal (art. 184 não lido): https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm
- GitHub ToS: https://docs.github.com/en/site-policy/github-terms/github-terms-of-service
- MediaWiki CORS: https://www.mediawiki.org/wiki/API:Cross-site_requests
- Internet Archive devs: https://archive.org/developers/
- Faded Page: https://www.fadedpage.com/copyright.php
- HathiTrust (guia secundário): https://guides.library.mun.ca/hathitrust
- Portal Domínio Público (secundária): https://periodicos.ufmg.br/index.php/moci/article/view/17008
- CJEU (comentários): https://legalblogs.wolterskluwer.com/copyright-blog/copyright-law-and-the-pandoras-kodi-box/ e https://www.scl.org/3732-hyperlinking-judgment-from-cjeu/

## 8. O que não consegui confirmar

- Texto do art. 184 do Código Penal e jurisprudência brasileira sobre links para sites piratas.
- Texto das sentenças GS Media, Filmspeler, Ziggo (só comentários) e do DMCA 512/1201.
- Status do processo da Z-Library, domínios ativos hoje e bloqueios no Brasil.
- Termos oficiais de Domínio Público/MEC, MEC Livros, BNDigital/Brasiliana, Biblioteca Digital Mundial, Feedbooks, ManyBooks, HathiTrust (acesso do Brasil), LibriVox, Mundo Ebooks, Casa do Saber.
- CORS de Gutenberg (e OPDS), Standard Ebooks, Open Library, Internet Archive e raw/releases do GitHub: testar com curl -I e cabeçalho Origin.
- Política de User-Agent da Wikimedia, licença exata das edições do Standard Ebooks, termos atuais da Google Books API, regras do GitHub para raw.githubusercontent.com.
- Suporte atual a File Handling API e Share Target em Safari/iOS.
- Existência de importação aberta do Kindle (não achei).
