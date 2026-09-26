# Pesquisa para a auditoria do Babel Play: segurança, performance, Meta Quest e celulares

**Data da pesquisa:** 2026-09-26. Nenhum arquivo do repositório foi alterado.

**Convenções**

- Toda afirmação traz a fonte (URL) e a data da página (publicação ou "Updated" quando a página mostra).
- **"NÃO ENCONTRADO"** quer dizer que procurei e não achei fonte confiável.
- **"BCD"** é o `mdn/browser-compat-data` (branch main, lido em 2026-09-26): https://github.com/mdn/browser-compat-data
- No BCD, o Quest Browser (`oculus`) aparece quase sempre como **"mirror"**. Isso significa que o dado foi **copiado do Chrome Android** e **não testado no Quest**. Para o Quest, o BCD é só um indício. A confirmação exige teste no aparelho.

**Ferramentas de pesquisa.** O Firecrawl atingiu o limite gratuito no meio do trabalho. Continuei com WebFetch, Tavily e consultas diretas à API do GitHub, ao npm, ao Hugging Face Hub e ao registro do Semgrep.

---

## 1. Metodologias de segurança

### 1.1 Padrões e listas (versões vigentes)

| Referência                | Versão vigente                                               | Data                                                                                                  | Fonte                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OWASP ASVS                | **5.0.0**: 17 capítulos, ~350 requisitos, níveis L1, L2 e L3 | maio/2025 (Global AppSec EU); repositório ativo em 2026-09-03                                         | https://owasp.org/www-project-application-security-verification-standard · https://github.com/owasp/asvs · resumo: https://codific.com/owasp-asvs-a-comprehensive-overview/ |
| OWASP Top 10              | **2025**                                                     | lançado em nov/2025 (o post do Reddit sobre o lançamento indica isso; o site oficial não mostra data) | https://top10.owasp.org/2025/en/                                                                                                                                            |
| OWASP API Security Top 10 | **2023**. Não achei edição mais nova.                        | 2023                                                                                                  | https://owasp.org/API-Security/editions/2023/en/0x11-t10/                                                                                                                   |
| OWASP WSTG                | **v4.2 estável**; a v5.0 está em desenvolvimento             | página lida em 2026-09-26                                                                             | https://owasp.org/www-project-web-security-testing-guide/                                                                                                                   |
| OWASP Top 10 for LLM Apps | **2026 (v1.0)**                                              | 2026-08-03                                                                                            | https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/                                                                                                               |
| CWE Top 25                | **2025**                                                     | 2025-12-11                                                                                            | https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html · https://www.cisa.gov/news-events/alerts/2025/12/11/2025-cwe-top-25-most-dangerous-software-weaknesses        |

**ASVS 5.0: níveis e capítulos que importam para SPA React + API Express + SQLite**

Fonte: codific.com (resumo do ASVS 5.0).

- **L1:** enxugado, pensado para adoção rápida.
- **L2:** é o padrão ("standard default"). É o nível recomendado para o Babel Play, porque o app tem cobrança e usuários menores de idade.
- **L3:** alta garantia.

Capítulos relevantes:

- **V1** Encoding and Sanitization
- **V2** Validation and Business Logic: inclui antiautomação e abuso de fluxo, o que cobre gamificação e trial
- **V3** Web Frontend Security: cabeçalhos, cookies, isolamento de origem, recursos de terceiros; é aqui que entram CSP e COOP/COEP
- **V4** API and Web Service
- **V6** Authentication
- **V7** Session Management
- **V8** Authorization: BOLA e IDOR
- **V9** Self-Contained Tokens: JWT
- **V11** Cryptography
- **V12** Secure Communication
- **V13** Configuration: inclui segredos e dependências
- **V14** Data Protection: inclui dados no cliente (IndexedDB e Cache Storage)
- **V15** Secure Coding and Architecture
- **V16** Security Logging and Error Handling

Capítulos que provavelmente se aplicam pouco:

- **V5** File Handling: só se houver upload.
- **V10** OAuth/OIDC: só se houver login social.
- **V17** WebRTC: não se aplica.

**OWASP Top 10:2025** (https://top10.owasp.org/2025/en/)

- A01 Broken Access Control
- A02 Security Misconfiguration
- **A03 Software Supply Chain Failures** (nova)
- A04 Cryptographic Failures
- A05 Injection
- A06 Insecure Design
- A07 Authentication Failures
- A08 Software or Data Integrity Failures
- A09 Security Logging and Alerting Failures
- **A10 Mishandling of Exceptional Conditions** (nova)

Para o Babel Play:

- **A03** cobre os pacotes npm e também os **modelos ONNX baixados do Hugging Face**. Vale fixar a revisão ou o hash, e considerar SRI ou self-host.
- **A10** cobre falhas de inicialização do WebGPU/WASM e caminhos de erro que ficam "abertos".

**OWASP API Security Top 10:2023**: API1 BOLA, API2 Broken Authentication, API3 BOPLA, API4 Unrestricted Resource Consumption, API5 BFLA, API6 Unrestricted Access to Sensitive Business Flows, API7 SSRF, API8 Security Misconfiguration, API9 Improper Inventory Management, API10 Unsafe Consumption of APIs. Os itens de maior peso para o app:

- **API4:** rate limit e custo do proxy de LLM.
- **API6:** abuso de trial e de gamificação.
- **API7:** SSRF.
- **API10:** o webhook do Asaas e as respostas do LLM.

**OWASP LLM Top 10 2026**

Os nomes e a ordem abaixo vêm de uma fonte secundária: https://hackerdna.com/blog/owasp-llm-top-10, publicada em 2026-08-08. **Não consegui extrair a lista da página oficial**, que só expõe o PDF.

| Posição 2026 | Risco                            | Posição 2025                      |
| ------------ | -------------------------------- | --------------------------------- |
| LLM01        | Prompt Injection                 | 1                                 |
| LLM02        | Sensitive Information Disclosure | 2                                 |
| LLM03        | Excessive Agency                 | 6                                 |
| LLM04        | Supply Chain                     | 3                                 |
| LLM05        | Data and Model Poisoning         | 4                                 |
| LLM06        | Unbounded Consumption            | 10                                |
| LLM07        | Misinformation                   | 9                                 |
| LLM08        | Hidden Context Exposure          | 7 (antes "System Prompt Leakage") |
| LLM09        | Vector and Embedding Weaknesses  | 8                                 |
| LLM10        | Improper Output Handling         | 5                                 |

**Confira no PDF oficial antes de citar no relatório final.**

Itens de maior peso para um proxy de LLM:

- **LLM01:** a entrada do aluno manipula o prompt.
- **LLM02:** PII de menores enviada ao provedor.
- **LLM06:** custo sem limite; exige cota por usuário e `max_tokens`.
- **LLM08:** vazamento do system prompt.
- **LLM10:** saída do LLM renderizada como HTML, com risco de XSS.

**CWE Top 25 2025** (https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html). Itens relevantes para a stack:

| Posição | CWE     | Fraqueza                                                |
| ------- | ------- | ------------------------------------------------------- |
| 1       | CWE-79  | XSS                                                     |
| 2       | CWE-89  | SQL injection                                           |
| 3       | CWE-352 | CSRF                                                    |
| 4       | CWE-862 | Missing Authorization                                   |
| 6       | CWE-22  | Path Traversal                                          |
| 17      | CWE-863 | Incorrect Authorization                                 |
| 18      | CWE-20  | Improper Input Validation                               |
| 20      | CWE-200 | Exposure of Sensitive Information                       |
| 21      | CWE-306 | Missing Authentication for Critical Function            |
| 22      | CWE-918 | SSRF                                                    |
| 24      | CWE-639 | IDOR (Authorization Bypass Through User-Controlled Key) |
| 25      | CWE-770 | Allocation of Resources Without Limits or Throttling    |

### 1.2 Checklist de segredos

- **`VITE_*` vai para o bundle do cliente.** A doc do Vite diz que as variáveis com prefixo `VITE_` são expostas no código do cliente após o build, e que não devem conter informação sensível como chaves de API. Para segredos, recomenda backend ou funções serverless/edge. `envPrefix` troca o prefixo. Fonte: https://vite.dev/guide/env-and-mode (lida em 2026-09-26).
  - **Pode expor:** URL pública da API, feature flags, IDs públicos de analytics e uma chave pública de SDK que o provedor declare como pública.
  - **Não pode expor:** chave do Gemini/Groq/OpenRouter, token do Asaas, `JWT_SECRET`, credencial SMTP, chave do Langfuse.
  - **Verificação prática:** depois de `vite build`, rode `grep -rE "sk-|AIza|api[_-]?key|secret" dist/`.
- **gitleaks v8.30.1** (release de 2026-03-21, conferido na API do GitHub). Fonte: https://github.com/gitleaks/gitleaks
  - Docker: `docker run -v <pasta>:/path zricethezav/gitleaks:latest git /path` para o histórico, ou `... dir /path` para os arquivos atuais.
  - Pode rodar como hook de pre-commit.
- **TruffleHog v3.97.9** (release de 2026-09-24). Fonte: https://github.com/trufflesecurity/trufflehog
  - Docker: `docker run --rm -it -v "$PWD:/pwd" trufflesecurity/trufflehog:latest filesystem /pwd --results=verified`.
  - O modo `git file://...` varre o histórico.
  - `--results=verified` mostra só credenciais confirmadas como válidas por chamada à API do provedor.
- **`.env` e `.gitignore`.** Confira que `.env*` está ignorado, com exceção de `.env.example`. Confira também que nenhum `.env` aparece no histórico: é isso que o gitleaks em modo `git` pega. Se aparecer, **rotacione a chave**; apagar do histórico não basta. A regra de rotação é prática comum de mercado, não tem fonte específica aqui.

### 1.3 Rate limiting

- **Algoritmos.**
  - **Fixed window:** um contador por janela. É simples, mas permite o dobro de requisições na virada da janela.
  - **Sliding window:** log ou contador ponderado. Distribui melhor.
  - **Token bucket:** permite rajadas (burst) com uma taxa média fixa.
  - Esta descrição é conceitual; não achei fonte oficial única de 2025–2026 para citar.
- **express-rate-limit v8.7.0** (release de 2026-08-29). Fonte: https://github.com/express-rate-limit/express-rate-limit
  - Opções: `windowMs`, `limit`, `standardHeaders: 'draft-6' | 'draft-7' | 'draft-8'`, `keyGenerator` (padrão: IP), `ipv6Subnet` (32 a 64 bits) e stores externos (Redis, Memcached).
  - A doc avisa que o `MemoryStore` padrão dá **resultados inconsistentes com vários processos ou servidores**. Fonte: https://express-rate-limit.mintlify.app/overview
  - **Não encontrei na doc lida qual algoritmo a lib usa.**
  - Atrás de proxy (Fly.io, Cloudflare), configure `app.set('trust proxy', n)` corretamente. Sem isso, todos os clientes compartilham o IP do proxy, ou o IP pode ser forjado via `X-Forwarded-For`.
- **rate-limiter-flexible.** Usa "Flexible Fixed Window" e tem `BurstyRateLimiter` para rajadas. Tem backend **SQLite**, o que é útil para persistir sem Redis, e exemplos de proteção contra brute force de login. Fonte: https://github.com/animir/node-rate-limiter-flexible (lida em 2026-09-26).
- **Padrão recomendado para o Babel Play.** Este é o meu desenho, baseado nas fontes acima e no API4/LLM06.
  1. Um limite global por IP, largo, contra DoS.
  2. Limites por usuário autenticado (chave = user id) nas rotas caras: proxy de LLM e escrita de progresso.
  3. Na rota de login, limite por (usuário + IP) sobre falhas consecutivas.
  4. **Cota diária de tokens de LLM por usuário, persistida no SQLite.** É ela que protege o custo; o rate limit por minuto não protege.
  5. Proteção do banco: `busy_timeout`, transações curtas, e fazer a escrita do SQLite em lote.

### 1.4 Cabeçalhos: CSP, COOP e COEP

- **SharedArrayBuffer exige contexto seguro e página cross-origin isolated** (COOP `same-origin` + COEP `require-corp` ou `credentialless`). Fonte: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer · https://web.dev/articles/coop-coep
- **Suporte a COEP** (BCD, `http/headers/Cross-Origin-Embedder-Policy`):

  |                  | Chrome | Safari          | Firefox |
  | ---------------- | ------ | --------------- | ------- |
  | Cabeçalho COEP   | 83     | 15.2            | 79      |
  | `credentialless` | 96     | **não suporta** | 119     |

  **Consequência:** no Safari/iOS só `require-corp` funciona. Todo recurso cross-origin precisa vir com CORS ou `Cross-Origin-Resource-Policy`. Isso vale para os modelos do Hugging Face CDN, para fontes e para imagens. Senão, `crossOriginIsolated` fica `false` no iOS e o ORT cai para WASM com uma thread.

- **Efeito do COOP `same-origin`:** anula `window.opener`. Isso pode quebrar popups de pagamento ou OAuth, porque perdem o `opener`. A diretriz da Meta cita `BroadcastChannel` justamente porque "sobrevive ao COOP anulando window.opener". Fonte: https://github.com/meta-quest/2d-web-v0-template/blob/main/docs/QUEST_GUIDELINES.md (commit de 2026-09-15).
- **CSP para transformers.js/onnxruntime-web.** O WASM precisa de `script-src 'wasm-unsafe-eval'`. Os workers precisam de `worker-src 'self' blob:` se o ORT criar workers via blob. `connect-src` deve listar o host dos modelos. **Não achei uma página oficial do ORT listando a CSP mínima**; valide com `Content-Security-Policy-Report-Only` antes de aplicar.

### 1.5 Dependências e SAST (tudo local, via Docker no Windows)

- **npm audit:** nativo do npm; `npm audit --omit=dev` para focar no que vai para produção.
- **Trivy v0.74.0** (release de 2026-08-14). Fonte: https://github.com/aquasecurity/trivy
  - `docker run --rm -v "%cd%:/src" aquasec/trivy fs --scanners vuln,secret,misconfig /src`
  - Varre `package-lock.json`, segredos e Dockerfile/fly.toml.
- **Semgrep v1.178.0** (release de 2026-09-23). Rulesets **que existem** no registro (verifiquei com `https://semgrep.dev/c/p/<nome>` em 2026-09-26):
  - `p/javascript`, `p/nodejs`, `p/react`, `p/secrets`, `p/owasp-top-ten`, `p/security-audit`, `p/default`.
  - **`p/express` não retornou regras**, e `p/typescript` veio praticamente vazio. As regras de Express estão dentro de `p/javascript` e `p/nodejs`.
  - Comando: `docker run --rm -v "%cd%:/src" semgrep/semgrep semgrep scan --config p/javascript --config p/nodejs --config p/react --config p/secrets --config p/owasp-top-ten /src`
- **Para validar achados em profundidade:** a skill `codeql-audit` já existe no ambiente do usuário.

---

## 2. Metodologias de performance

- **Core Web Vitals atuais** (web.dev, atualizado em 2024-10-31, lido em 2026-09-26). Mede-se no **percentil 75** de campo. Fonte: https://web.dev/articles/vitals

  | Métrica | Bom      | Ruim     |
  | ------- | -------- | -------- |
  | **LCP** | ≤ 2,5 s  | > 4 s    |
  | **INP** | ≤ 200 ms | > 500 ms |
  | **CLS** | ≤ 0,1    | > 0,25   |

  Não achei mudança de limiar em 2025–2026.

- **RAIL:** a própria página diz que Core Web Vitals "é a abordagem recomendada" em vez de RAIL. Os alvos do RAIL são: resposta < 100 ms, animação com frame de ~10 ms de trabalho, load < 5 s. Página de 2020-06-10: https://web.dev/articles/rail. **Use RAIL só como modelo mental.**
- **Orçamento de frame no Quest:** 90 Hz dá ~11 ms por frame (diretriz Meta, QUEST_GUIDELINES.md, 2026-09-15).
- **Orçamento de performance.** Não achei página oficial de 2025–2026 com números fixos. Proposta prática:
  - Bundle JS inicial comprimido com limite definido e gate no CI.
  - Modelos **fora** do caminho do LCP: carregar sob demanda.
  - INP ≤ 200 ms com inferência **sempre em Worker**, nunca na main thread.
- **Profiling de Node.**
  - Nativos: `node --prof` + `node --prof-process`, recomendados na doc oficial https://nodejs.org/en/learn/getting-started/profiling (sem data visível). Também `--cpu-prof` e `--heap-prof`, que geram `.cpuprofile` e `.heapprofile` abríveis no Chrome DevTools.
  - **Clinic.js:** o repositório `clinicjs/node-clinic` não está arquivado, mas o **último push foi em 2024-09-19** (API do GitHub). Trate como manutenção baixa.
  - **0x:** último publish no npm em 2025-07-07 (v6.0.0).
  - Recomendação: preferir `--cpu-prof` com DevTools e usar Clinic ou 0x como apoio.
- **Consultas lentas no SQLite.** Fonte: https://www.sqlite.org/eqp.html
  - Use `EXPLAIN QUERY PLAN`.
  - **SCAN** = varredura completa; **SEARCH** = acesso a um subconjunto.
  - `USING INDEX` e `USING COVERING INDEX` indicam bom uso de índice.
  - `USE TEMP B-TREE FOR ORDER BY/GROUP BY/DISTINCT` pede um índice.
  - Na CLI, `.eqp on` mostra o plano automaticamente.
  - Métrica prática: envolver o `db.prepare().run/all` com medição de tempo e logar consultas acima de X ms.
- **N+1.** Detecte contando queries por requisição (um contador no wrapper do DB, por request) e procurando `.all()` ou `.get()` dentro de loops. Corrija com `IN (...)` ou `JOIN`. Não há fonte oficial específica; é prática padrão.
- **Carga.**
  - **k6 v2.3.0** (release de 2026-09-21): https://github.com/grafana/k6. Roda via Docker (`grafana/k6`).
  - **autocannon 8.0.0** (npm).
  - Com SQLite, meça a latência de escrita sob concorrência. Uma conexão escritora serializa as escritas; confira WAL e `busy_timeout`.

---

## 3. Meta Quest (Quest 2, 3, 3S): Meta Quest Browser standalone

### 3.1 Versão e engine

- As notas oficiais mostram:

  | Versão do Browser | Data           | Nota                                |
  | ----------------- | -------------- | ----------------------------------- |
  | 144               | 2026-03-02     | "Updated to Chromium Milestone 144" |
  | 146.0             | 2026-04-21     | "updated to Chromium Milestone 146" |
  | 146.1             | 2026-05-11     |                                     |
  | 146.2             | 2026-06-03     |                                     |
  | 149.1             | 2026-07-27     |                                     |
  | **150.1**         | **2026-08-28** | versão mais recente                 |

  Fonte: https://developers.meta.com/horizon/release-notes/web/ e https://developers.meta.com/horizon/downloads/package/browser/150.1/

- **As notas da 149.1 e da 150.1 não dizem explicitamente o milestone do Chromium.** A partir da 144 a numeração passou a coincidir com o milestone. Antes era 41.x: a 41.4 é de 2025-12-09.
- **User-Agent** (Browser specs, atualizado em 2026-07-21):
  - Em **modo desktop, que é o padrão**, o UA é `Mozilla/5.0 (X11; Linux x86_64; Quest 3) ... OculusBrowser/... Chrome/...`, o browser **ignora `<meta viewport>`** e não há o token `Mobile`.
  - O Quest 3S também se identifica como `Quest 3`.
  - A Meta manda **não usar o UA para detectar recursos**.
  - **Consequência:** qualquer heurística "é celular?" por UA ou por `pointer: coarse` pode classificar o Quest como desktop.
  - Fonte: https://developers.meta.com/horizon/documentation/web/browser-specs/
- **Tamanho do painel 2D:** padrão 1280×670; mínimo 500×495; máximo 2000×1070. Fonte: mesma página.

### 3.2 WebGPU

- **Oficialmente, a Meta só anuncia WebGPU no contexto de WebXR**, e sempre como experimental:
  - 146.0: "Experimental WebGPU and WebXR depth projection support".
  - 149.1: "WebGPU support for space-warp layers".
  - 150.1: "Experimental support for foveation to WebGPU in WebXR".
  - Fonte: https://developers.meta.com/horizon/release-notes/web/
- **NÃO ENCONTRADO:** documentação oficial da Meta que confirme `navigator.gpu` com adaptador utilizável em **páginas 2D comuns**, fora de uma sessão WebXR.
- O BCD marca o `oculus` como "mirror" do Chrome Android. O Chrome Android tem WebGPU desde o 121 em Android 12+ com GPU Qualcomm/ARM (https://developer.chrome.com/docs/web-platform/webgpu/overview). Isso é **inferência, não teste**.
- **Ação:** abrir `https://webgpureport.org` no Quest 3 e no Quest 2 e registrar `requestAdapter()` e os limites (`maxBufferSize`, `maxStorageBufferBindingSize`). O app **já faz a detecção certa** (WebGPU se houver adaptador, senão WASM).

### 3.3 WASM SIMD/threads, SharedArrayBuffer e COOP/COEP

- **NÃO ENCONTRADO** em documento oficial da Meta sobre SAB/threads no Quest Browser. Pelo BCD, é "mirror" do Chrome Android, que tem SAB desde o 89 (cross-origin isolated).
- **Ação:** checar `crossOriginIsolated === true` e `navigator.hardwareConcurrency` no aparelho.

### 3.4 Memória

- Limite **por app nativo**, que é o teto provável do processo do browser, mas **não é um número por aba**:

  | Aparelho            | Limite       |
  | ------------------- | ------------ |
  | Quest 2 / Quest Pro | **4,4 GiB**  |
  | Quest 3 / 3S        | **5,75 GiB** |

  Fonte: https://developers.meta.com/horizon/essentials/memory-ram/ (atualizado em 2026-08-31). A página não fala do browser. A mesma família de páginas diz que um app pode passar do limite sem ser morto imediatamente pelo `lmkd`.

- **NÃO ENCONTRADO:** limite oficial por aba do Quest Browser. O renderer do Chromium divide essa memória com a UI do browser e com outras abas.
- **Ação:** medir com `performance.measureUserAgentSpecificMemory()`, que exige cross-origin isolation, e com o DevTools remoto (`chrome://inspect`) carregando whisper-base e whisper-small.

### 3.5 Áudio e fala

- **getUserMedia (microfone):** o BCD dá "mirror" do Chrome Android, ou seja, suportado. Não há documento Meta específico. Teste o prompt de permissão; a Meta corrigiu um "looping permissions prompt" em fev/2026 (release notes).
- **getDisplayMedia:** no BCD, **Chrome Android = não suportado** (`version_added: false`; entre as versões 72 e 88 era exposto, mas sempre falhava com `NotAllowedError`), inclusive `systemAudio`. O Quest herda isso via "mirror". **NÃO ENCONTRADO** qualquer doc da Meta oferecendo captura de aba ou de áudio do sistema pelo browser.
  - **Recomendação:** tratar a "legenda de áudio do sistema/aba" como **indisponível no Quest e no celular**.
- **Web Audio / AudioWorklet:** BCD "mirror" do Chrome (66+); suporte presumido, não verificado no aparelho.
- **Web Speech API (SpeechRecognition):**
  - **Não disponível no Quest Browser**, segundo relatos da comunidade (Reddit r/WebXR, 2022: https://www.reddit.com/r/WebXR/comments/zbsjxq/web_speech_api_is_not_available_in_the_quest/; artigo no TDS). **Não achei confirmação oficial de 2025–2026.**
  - Alternativa útil: o **ditado de voz do teclado do sistema** Quest funciona em `<input>` do Browser e tem modo **on-device** opt-in, disponível globalmente. O modo online só existe nos EUA. Fonte: https://www.meta.com/help/quest/463323051789865 ("Updated 5 weeks ago", lido em 2026-09-26).
- **Translator API (Chrome built-in AI):** a doc do Chrome diz que funciona "in Chrome on desktop" e "don't work on mobile devices" (Chrome 138+). Fonte: https://developer.chrome.com/docs/ai/translator-api (atualizada em 2025-05-20). O BCD: Chrome Android = não. **No Quest: indisponível**, pela mesma herança; não achei doc da Meta.

### 3.6 Armazenamento e PWA

- **Cotas:** o Chrome permite a uma origem usar até ~60% do disco (https://web.dev/articles/storage-for-the-web). A diretriz da Meta avisa, para PWAs no Quest: "limited storage quota (don't bundle huge local assets)", sem push e **sem execução em background ao trocar de app** (QUEST_GUIDELINES.md, 2026-09-15). **NÃO ENCONTRADO:** um número oficial de cota no Quest. Use `navigator.storage.estimate()`.
- **PWA no Quest:**
  - Distribuição opcional na Horizon Store via **Bubblewrap**, que gera um projeto Android com Trusted Web Activity: `bubblewrap init --manifest=... --metaquest`. Fonte: https://developers.meta.com/horizon/documentation/web/pwa-overview/ (atualizada em 2026-07-22).
  - Requisitos da diretriz: manifest com ícone ≥ 512×512 maskable, `display: standalone`/`fullscreen`, `orientation: landscape`, **service worker com fallback offline (obrigatório)** e HTTPS.

### 3.7 Diretrizes oficiais para web 2D no Quest

Números da **meta-quest/2d-web-v0-template/docs/QUEST_GUIDELINES.md** (repositório oficial da Meta, commit de 2026-09-15; ele cita as docs Horizon OS) e de **Eyes Best Practices** (atualizada em 2026-09-09):

| Item                                             | Valor                                                                                                      | Fonte                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Alvo interativo mínimo                           | **48 dp ≈ 48 CSS px** (visual mínimo 32 dp)                                                                | QUEST_GUIDELINES                                                |
| Alvo para web no Browser, pensando em olhar/gaze | **≥ 56 × 56 CSS px**                                                                                       | https://developers.meta.com/horizon/design/eyes-best-practices/ |
| Texto de corpo                                   | **14 dp**; mínimo legível 11 dp; o template usa 17 px na raiz                                              | QUEST_GUIDELINES                                                |
| Contraste                                        | 4,5:1 para texto; 3:1 para UI e texto grande                                                               | QUEST_GUIDELINES                                                |
| Cores                                            | não usar preto puro (< ~13/255 fica indistinguível) nem branco puro em áreas grandes; tema escuro primeiro | QUEST_GUIDELINES                                                |
| Taxa de quadros                                  | 90 Hz (≈ 11 ms/frame); até 120 Hz                                                                          | QUEST_GUIDELINES                                                |
| Layout                                           | fluido de 500 a 2000 px; colapsar para uma coluna abaixo de ~760 px; reagir a `ResizeObserver`             | QUEST_GUIDELINES                                                |
| Hover e foco                                     | o raio do controle vira hover e o pinch vira click; `:hover` e `:focus-visible` bem visíveis (≥ 2 px)      | QUEST_GUIDELINES                                                |
| Animação                                         | sem flashes; animações suaves; roll-up de legenda de ~0,5 s ease-out é a referência da Meta                | QUEST_GUIDELINES                                                |
| Performance em VR                                | Quest costuma ser limitado por fill-rate: cuidado com transparência e **partículas (overdraw)**            | QUEST_GUIDELINES                                                |

### 3.8 CPU e benchmarks

- **XR2 Gen 2 (Quest 3/3S):** CPU com 2 núcleos de performance e 4 de eficiência; a Qualcomm alega que "supera até o Snapdragon 8 Gen 2" (fala de executivo da Qualcomm). GPU 2,5× a do XR2 Gen 1; IA 8×. Fonte: https://www.digitaltrends.com/computing/new-qualcomm-chips-power-next-gen-vr-headsets-and-ar-glasses (2023). **É alegação do fabricante, não benchmark independente.**
- **O XR2 Gen 1 do Quest 2 deriva do Snapdragon 865**, um celular topo de linha de 2020. Fonte: https://mixed-news.com/en/meta-quest-3-new-gpu-could-offer-2-5x-performance
- **NÃO ENCONTRADO:** benchmark público de transformers.js, onnxruntime-web ou Whisper **no Quest**, nem de Whisper web em Snapdragon com números reproduzíveis de 2025–2026. Existe a issue "Whisper webgpu vs wasm performance" (https://github.com/huggingface/transformers.js/issues/894, 2024-11-07), sem dados de Quest.
- **Ação:** o app já tem uma bancada de fala (memória "bancada-fala-2026-09"). Estenda-a ao Quest 2/3 via DevTools remoto.

---

## 4. Celulares: Android Chrome e iOS Safari (2026)

| Recurso                          | Android Chrome                                                                     | iOS Safari                                                                                                         | Fonte                                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| WebGPU                           | desde o 121, em Android 12+ com GPU Qualcomm/ARM; outras GPUs ficam sem            | **Safari 26** (iOS/iPadOS 26)                                                                                      | https://developer.chrome.com/docs/web-platform/webgpu/overview · https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ · BCD |
| WebGPU com Advanced Protection   | o Android 16 Advanced Protection **desliga o WebGPU** no Chrome                    | n/a                                                                                                                | https://android.gadgethacks.com/news/android-16-advanced-protection-disables-chrome-webgpu/ (fonte secundária)                       |
| SharedArrayBuffer (threads WASM) | desde o 89, com isolation                                                          | desde o 15.2, com COOP + COEP **`require-corp`** (sem `credentialless`)                                            | BCD                                                                                                                                  |
| Workers aninhados                | sim                                                                                | Safari 16.4+ (parcial: não em Shared Workers)                                                                      | BCD `api/Worker.worker_support`                                                                                                      |
| getDisplayMedia                  | **não**                                                                            | **não**                                                                                                            | BCD                                                                                                                                  |
| AudioWorklet                     | sim                                                                                | Safari 14.1+                                                                                                       | BCD                                                                                                                                  |
| SpeechRecognition                | "mirror" do Chrome                                                                 | `webkit`-prefixado desde o 14.1                                                                                    | BCD                                                                                                                                  |
| Translator API                   | **não** (só desktop)                                                               | **não**                                                                                                            | https://developer.chrome.com/docs/ai/translator-api                                                                                  |
| `navigator.deviceMemory`         | sim; **desde o Chrome 147 retorna 1, 2, 4 ou 8** (antes podia retornar 0,25 e 0,5) | **não**                                                                                                            | BCD                                                                                                                                  |
| `navigator.hardwareConcurrency`  | sim                                                                                | sim, mas **limitado a 4 ou 8** contra fingerprinting                                                               | BCD                                                                                                                                  |
| `navigator.connection`           | sim                                                                                | **não**                                                                                                            | BCD                                                                                                                                  |
| `storage.persist()`              | sim                                                                                | 15.2+; concedido por heurística, por exemplo quando instalado na tela inicial                                      | BCD · https://webkit.org/blog/14403/updates-to-storage-policy/ (2023-08-10)                                                          |
| Cota de storage                  | ~60% do disco por origem                                                           | Safari 17+: navegador até 60% por origem, apps (WebView) até 15%; eviction por LRU; origens com persist protegidas | web.dev · WebKit 2023                                                                                                                |

**Memória no iOS: aba morta pelo jetsam**

- Engenheiro do WebKit, em jul/2024: o limite de memória **por web process é 1,5 GB**, e o ArrayBuffer JS mais o buffer WebGPU **somam** para esse limite. Fonte: https://github.com/mlc-ai/web-llm/issues/386
- Artigo acadêmico (arXiv 2605.20706, maio/2026, "Llamas on the Web"):
  - Relata abas do Safari no iOS limitadas a **< 500 MB**.
  - Relata que, no Safari, o transformers.js chegou a **10 GB até a aba ser morta**, por vazamento na combinação transformers.js + WebGPU do Safari.
  - Relata que o transformers.js faz cópias temporárias em CPU antes de enviar os pesos à GPU.
  - Fonte: https://arxiv.org/html/2605.20706v1
- O Safari não falha o `memory.grow()` do WASM; ele **mata a aba**. Fonte: https://bugs.webkit.org/show_bug.cgi?id=221530
- Relato de campo, sem data visível, com iPhone SE 2 de 3 GB e ONNX Runtime Web (https://zenn.dev/kaz_sakai/articles/ios-safari-onnx-memory):
  - O heap WASM não volta ao SO; **rodar a inferência num Worker e dar `terminate()`** libera a memória.
  - `enableCpuMemArena: false` e `enableMemPattern: false` reduzem o pico.
  - Liberar a sessão após o uso em aparelho restrito.
  - O autor diz também que o Safari não suporta workers aninhados e usa `numThreads = 1`. **Isso contradiz o BCD (16.4+)**; provavelmente vale para iOS antigo, mas não verifiquei.

**Estratégias de degradação** (APIs com suporte conforme o BCD acima)

1. **Detecção de capacidade.** Nenhuma API isolada basta; combine sinais:
   - `navigator.gpu?.requestAdapter()` e depois `adapter.limits.maxBufferSize` / `maxStorageBufferBindingSize`.
   - `crossOriginIsolated`.
   - `hardwareConcurrency`.
   - `deviceMemory`, lembrando que só existe no Chromium e que, desde o 147, tem teto 8 e piso 1.
   - `connection.effectiveType` / `saveData`, só no Chromium.
   - Sem `deviceMemory` (iOS), trate como restrito.
2. **Modelos menores e quantizados.** O transformers.js 4.3.0 (release de 2026-09-16) aceita `dtype` fp32, fp16, q8/int8/uint8, q4/bnb4/q4f16 e **dtype por módulo** (encoder/decoder). A doc destaca que o Whisper é "extremely sensitive to quantization", especialmente no encoder. Fonte: https://huggingface.co/docs/transformers.js/guides/dtypes
3. **Carregar sob demanda:** baixar só quando o usuário ativa a transcrição, com progresso e opção de cancelar.
4. **`navigator.storage.persist()`** depois do primeiro download: no iOS, só com o app instalado na tela inicial. Sem isso, o Safari pode apagar tudo após 7 dias sem interação (web.dev).
5. **Tamanhos reais de download** (arquivos ONNX no Hugging Face, API do Hub consultada em 2026-09-26):

   | Modelo                                      | Combinação                                  | Tamanho                     |
   | ------------------------------------------- | ------------------------------------------- | --------------------------- |
   | silero-vad                                  | int8 / fp16                                 | **0,6 MB / 1,2 MB**         |
   | moonshine-tiny (27M, **só inglês**)         | encoder int8 7,9 + decoder_merged int8 20,2 | **≈ 28 MB**                 |
   | moonshine-base (61M, só inglês)             | int8                                        | ≈ 20,5 + 42,4 = **≈ 63 MB** |
   | whisper-tiny                                | encoder q8 10,1 + decoder_merged q8 30,7    | **≈ 41 MB**                 |
   | whisper-tiny                                | encoder fp32 32,9 + decoder q4 86,7         | ≈ 120 MB                    |
   | whisper-base                                | q8                                          | 23,2 + 53,7 = **≈ 77 MB**   |
   | whisper-base                                | encoder fp32 82,5 + decoder q4 123,6        | ≈ 206 MB                    |
   | whisper-small                               | q8                                          | 92,3 + 156,8 = **≈ 249 MB** |
   | whisper-small                               | encoder fp16 176,6 + decoder q4 233,1       | ≈ 410 MB                    |
   | opus-mt-en-es (Xenova, cada par de idiomas) | q8                                          | 52,9 + 60,2 = **≈ 113 MB**  |
   | opus-mt-en-es                               | q4f16                                       | ≈ 78 + 82 = 160 MB          |

   Fontes dos modelos: https://huggingface.co/onnx-community/whisper-tiny · /whisper-base · /whisper-small · /moonshine-tiny-ONNX · /moonshine-base-ONNX · /silero-vad · https://huggingface.co/Xenova/opus-mt-en-es · parâmetros e idioma do Moonshine: https://huggingface.co/UsefulSensors/moonshine-tiny

   **Nos arquivos ONNX do Whisper, `q4` é MAIOR que `q8` no decoder** (86,7 contra 30,7 MB no tiny). Para economizar download, `q8` é o menor.
   **"Tamanho razoável em rede móvel":** NÃO ENCONTRADO um limite oficial. A proposta da seção 5 é minha, não normativa.

---

## 5. Recomendações priorizadas para o Babel Play (camada gratuita, tudo local)

**Regra geral:** decidir o perfil **por medição de capacidade na hora** (seção 4, item 1), nunca por UA. O Quest em modo desktop se anuncia como `X11; Linux x86_64` (browser-specs da Meta).

### P0: segurança e riscos imediatos

1. **Fluxo de segredos no CI.** Varrer segredos (gitleaks `git` + TruffleHog `--results=verified`), grep no `dist/` e revisar todo `VITE_*` (seção 1.2).
2. **Proxy de LLM (LLM01/06/08/10 + API4).**
   - Cota diária persistida por usuário e `max_tokens`.
   - Rate limit por usuário.
   - Não renderizar a saída como HTML.
   - Não enviar PII de menores. Já existe uma pendência "Gemini × menores" na memória do projeto.
3. **Rate limit correto atrás do proxy:** `trust proxy` e um store compartilhado se houver mais de um processo (doc do express-rate-limit sobre o `MemoryStore`).
4. **COOP/COEP + CSP.**
   - Garantir CORS/CORP em todo recurso cross-origin, porque o Safari não tem `credentialless`.
   - Testar `crossOriginIsolated` no iOS, no Android e no Quest.
   - CSP com `'wasm-unsafe-eval'`, primeiro em modo report-only.
5. **Cadeia de suprimentos (A03 / LLM04).** Fixar a revisão (commit) dos modelos do Hugging Face ou hospedá-los você mesmo com hash, além do `npm audit` e do Trivy.

### P1: matriz de perfis de dispositivo

| Perfil                                                                                         | Como detectar                                                                                                            | STT                                                                                                                                         | MT                                                                                                                       | dtype            | Download inicial                                            | Recursos a desligar                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Quest standalone** (2/3/3S)                                                                  | sem `getDisplayMedia`; `requestAdapter()` pode vir nulo em página 2D (não confirmado); UA com `Quest` só para telemetria | **moonshine-tiny** (inglês) ou **whisper-tiny** q8 em WASM com threads; whisper-base só se o WebGPU estiver presente **e** a medição passar | opus-mt q8 **só sob demanda**, um par por vez                                                                            | q8               | ~30–45 MB (STT) + VAD; MT +113 MB opcional                  | **Legenda de áudio do sistema/aba** (não existe); **partículas e transparências pesadas** (fill-rate, diretriz Meta); PiP e legendas flutuantes; animações grandes. Alvos ≥ 48 px (56 px ideal), corpo ≥ 14–17 px, tema escuro sem preto puro. **Oferecer o ditado do teclado do sistema** como entrada de voz alternativa (ajuda Meta) |
| **Celular fraco** (iOS sem WebGPU ou com < 3 GB; Android sem WebGPU ou com `deviceMemory` ≤ 2) | sem adaptador; `deviceMemory` ≤ 2; `saveData`; iOS sem `deviceMemory` = tratar como fraco até provar o contrário         | moonshine-tiny (inglês) / whisper-tiny q8, **WASM**; no iOS, sessão num Worker descartável                                                  | desligado por padrão; ativar explicitamente                                                                              | q8               | ≤ ~45 MB; pedir confirmação se `effectiveType` não for `4g` | Tudo decorativo: partículas, blur, animações contínuas, PiP. Liberar a sessão ORT após o uso (relato zenn; limites de memória do WebKit)                                                                                                                                                                                                |
| **Celular bom** (Android 12+ Qualcomm/ARM com WebGPU; iPhone com iOS 26)                       | `requestAdapter()` ok e `maxBufferSize` suficiente; `deviceMemory` ≥ 4                                                   | whisper-base (encoder sensível: fp32 ou fp16 + decoder q4 no WebGPU; ou q8 total no WASM)                                                   | opus-mt q8 sob demanda                                                                                                   | misto por módulo | ~77–206 MB                                                  | Animações reduzidas se `prefers-reduced-motion`; no **iOS, evitar whisper-small** (limite de 1,5 GB por processo contando ArrayBuffer + GPU; o artigo de 2026 fala em < 500 MB)                                                                                                                                                         |
| **Desktop sem GPU** (WASM)                                                                     | sem adaptador; `hardwareConcurrency` ≥ 4                                                                                 | whisper-base q8, WASM com threads (exige `crossOriginIsolated`)                                                                             | opus-mt q8                                                                                                               | q8               | ~77 + 113 MB                                                | Nada de essencial; limitar efeitos se o INP passar de 200 ms                                                                                                                                                                                                                                                                            |
| **Desktop com GPU**                                                                            | `requestAdapter()` ok                                                                                                    | whisper-small (encoder fp16 + decoder q4) ou whisper-base fp32/q4                                                                           | opus-mt q8/fp16; a Translator API do Chrome desktop pode ser um motor extra **local e grátis** (Chrome 138+, só desktop) | por módulo       | ~206–410 MB                                                 | Nenhum                                                                                                                                                                                                                                                                                                                                  |

**Justificativas da matriz**

- Tamanhos: API do Hub, seção 4.
- Sensibilidade do encoder à quantização: guia de dtypes do transformers.js.
- Limites de memória: Meta memory-ram (2026-08-31), WebKit (issue 386 do web-llm) e arXiv 2605.20706.
- UI no Quest: QUEST_GUIDELINES (2026-09-15) e Eyes Best Practices (2026-09-09).
- Ausência de `getDisplayMedia`, da Translator API móvel e da SpeechRecognition no Quest: BCD, doc do Chrome e relatos citados.

### P2: performance e observabilidade

1. Inferência **sempre em Worker**. Meta: INP ≤ 200 ms no p75 (web.dev). No Quest, manter o frame em ≤ 11 ms.
2. Modelos fora do caminho do LCP (LCP ≤ 2,5 s); pré-carga só após a primeira interação.
3. Backend: rodar `EXPLAIN QUERY PLAN` nas consultas das rotas quentes, contar queries por requisição (N+1), fazer `--cpu-prof` sob carga com k6 e medir o event loop lag.
4. Medir no aparelho, com DevTools remoto no Quest e `performance.measureUserAgentSpecificMemory()`, e registrar na bancada de fala do projeto:
   - WebGPU em página 2D no Quest 2 e no Quest 3;
   - `crossOriginIsolated`;
   - pico de memória com whisper-tiny, whisper-base e whisper-small.

### Lacunas que a pesquisa NÃO fechou

As 3.2, 3.3, 3.4, 3.5 e 3.8 exigem teste no aparelho.

| Lacuna                                                                                          | Seção |
| ----------------------------------------------------------------------------------------------- | ----- |
| WebGPU em página 2D do Quest (não há doc oficial)                                               | 3.2   |
| SharedArrayBuffer e threads WASM no Quest (sem doc Meta; só herança do Chrome Android pelo BCD) | 3.3   |
| Limite de memória por aba do Quest Browser                                                      | 3.4   |
| Suporte a SpeechRecognition no Quest em 2025–2026 (só há relato de 2022)                        | 3.5   |
| Número de cota de storage no Quest                                                              | 3.6   |
| Benchmarks de transformers.js/Whisper no Quest ou em Snapdragon                                 | 3.8   |
| Algoritmo exato do express-rate-limit                                                           | 1.3   |
| Lista oficial do OWASP LLM Top 10 2026 (usada fonte secundária)                                 | 1.1   |
| CSP mínima oficial do onnxruntime-web                                                           | 1.4   |
