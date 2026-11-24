# Pendências do dono

Reunidas na faxina do OpenSpec de 23/11/2026 (main `d279f9e9`). A Parte 1 junta as tarefas abertas que dependem do dono nas 37
changes arquivadas nesta faxina (depois de arquivadas, a fonte única é este arquivo; o `tasks.md` original está em
`openspec/changes/archive/2026-11-23-<change>/`). A Parte 2 junta o que o dono precisa decidir ou fazer nas changes que
continuam vivas ou incertas. Formato: `change` · tarefa · o que fazer.

Legenda dos temas: flag e rampa, aparelho real, jurídico e privacidade, credenciais e infra, decisão de produto, conferência no navegador.

## Parte 1. Das changes arquivadas

### Ligar flag, rampa e variáveis de produção

- `parciais-incrementais` · 5.2 · Ligar `parciais_parakeet` e `parciais_vivos` (só depois da rodada em celular real, 5.1). `traducao_incremental` NÃO se liga. Registrar a decisão com data.
- `parciais-incrementais` · 1.2 · Confirmar o efeito mínimo provisório (-20%) e o k do mask-k (registrar no `criterio.md`).
- `acesso-sem-conta-v2` · 1.2 · Aprovar a change.
- `acesso-sem-conta-v2` · 6.1 · Staging com `acesso_restrito_sem_conta` ligada só para o id do dono; conferir porta, menor, adulto, migração, volta e livro.
- `acesso-sem-conta-v2` · 6.2 · Rampa `percentual` 10% -> 50% -> 100%, olhando o funil.
- `stt-ingles-volume-e-rota` · 6.2 · Ligar `stt_nuvem_normalizar` no staging, observar, depois produção.
- `aquecer-stt-na-intencao` · 5.3 · Decidir ligar `aquecer_stt_na_intencao` por perfil, depois de ver as medições (Safari/6 GB incluídos).
- `modo-interprete` · P.6 · Ligar a flag da voz natural numa migração nova (a 0046 é semente `INSERT OR IGNORE` e não liga nada), só depois de P.1 a P.5.
- `voz-natural-openrouter` · 6.2 · Pôr o Kokoro no `IA_PROVEDORES` do staging, ligar `voz_natural` lá e ouvir pt/en/es.
- `openrouter-como-provedor-de-ia` · 3.2 · Decidir `IA_EM_VOO_STT` em produção (recomendado 2).
- `aviso-fim-do-teste-e-teto` · 3.1 · Escolher o teto em US$ por plano (Essencial, Premium, Ao Vivo) e definir `TETO_USD_MES_*` em produção.
- `bergamot-multi-idioma-via-cdn` · 1.3 · Criar o bucket, CORS, publicar e definir `VITE_BERGAMOT_MODELOS_URL` (`docs/LANCAMENTO.md`).
- `vocab-forca-e-etiquetas` · 5.2 · Aplicar a migração 0028 no banco de produção (manual, ver `docs/deploy.md`).

### Aparelho real e navegador real

- `parciais-incrementais` · 5.1 · Rodada em celular real da rota pt/Parakeet (V1+V2+V7).
- `parciais-incrementais` · 1.6 · Amostra manual de ~20 falas para validar a precisão do alinhamento; se reprovar, decidir o plano B (MFA/wav2vec2).
- `lab-medicao-legenda-traduzida` · 4.5 · Rodada nos aparelhos reais (Android ~4 GB, iPhone 12 ou mais novo, Quest 3) preenchendo a matriz.
- `lab-medicao-legenda-traduzida` · 4.3 · Aceite da linha de base (quem aprova a base é quem a commita).
- `aquecer-stt-na-intencao` · 1.4 · Medir a memória do aquecimento por intenção no Safari/6 GB (Web Inspector) e registrar em `docs/planejamento/`.
- `modo-interprete` · 8.6 · Conferir no aparelho (Chrome com e sem o pacote de voz do inglês).
- `modo-interprete` · 7.8 · Conferir com áudio de verdade (Premium ou teste) a detecção de idioma.
- `interprete-historico-e-toque` · 5.3 · Conferir no celular (Chrome) e no computador com fala real; anotar o que falta medir no Quest.
- `escuta-guiada-por-nivel` · 3.3 · Experimentar em aparelho real (Safari/iOS e leitor de tela) e decidir se o modo inicial passa a ser o sugerido.
- `anki-connect` · 5.3 · Teste manual com Anki real e AnkiConnect (Chrome e Firefox; conferir o Safari).
- `bergamot-multi-idioma-via-cdn` · 3.3 · Bancada completa (COMET/FLEURS), gold de conversa e memória no celular.
- `gratis-sem-travar` · 9.16 · Medir no Quest e no celular o heap do Bergamot (548 MB reservados no Chromium do desktop).
- `carga-rapida-no-celular` · 5.1 · Bancada de 6 rodadas por perfil (`bancada-captura.mjs --perfis desktop,fraco --rodadas 6`); inválida neste Mac (sonda de áudio), rodar em outra máquina ou CI.
- `traducao-local-pelo-ingles` · 3.1 · Conferir coreano, russo e árabe no navegador (só japonês e chinês foram vistos ponta a ponta).
- `exercicios-de-frase` · 4.3 · Verificar no navegador real (voz sintetizada em ja/zh, teclado do Quest).
- `jogo-pares-minimos` · 5.3 · Verificar no navegador real a qualidade da voz sintetizada por idioma.
- `glosa-no-leitor` · 4.2 · Conferir no Chrome e no Safari a posição da glosa com entrelinhas baixas e nos 6 temas, e a repaginação ao mudar o tamanho da letra.
- `frases-i-mais-1` · 3.1 · Conferir no navegador, com conta de teste e sessão em inglês, a seção "Para estudar desta sessão".
- `aviso-fim-do-teste-e-teto` · 3.2 · Conferir no navegador o aviso do teste com uma conta de teste perto das 3 h.
- `credito-com-destino` · 6.3 · Conferência visual da prateleira paga e da fileira do passe.
- `vocab-conhecidas-e-ignoradas` · 6.2 · Conferir o contraste dos botões no fundo claro da janela flutuante (junto do e2e de `k`/`x`).

### Jurídico e privacidade

- `lab-medicao-legenda-traduzida` · 5.7 · Parecer de privacidade (LGPD art. 14, ECA Digital) sobre o evento de telemetria de campo e sobre menores. BLOQUEANTE para essa telemetria.
- `teste-de-3-dias` · 4.1 · Validar com o jurídico a redação nova dos termos (3.5) e da política de privacidade (teste).
- `openrouter-como-provedor-de-ia` · 3.1 · Atualizar a política de privacidade antes de produção (o provedor deixa de ser a Groq).
- `modo-interprete` · P.2 · Confirmar o operador de voz e a retenção dele no contrato (linhas "A CONFIRMAR" em `docs/lgpd/operadores.md`).
- `modo-interprete` · P.3 · Atualizar `public/privacidade.html` com a voz natural.
- `bancada-multi-modelo` · 5.3 · Registrar, por provedor recomendado, a política de uso do conteúdo para treinamento.

### Credenciais, contas e infraestrutura

- `teste-de-3-dias` · 4.2 · Conferir `SUPABASE_SERVICE_ROLE_KEY` nos secrets do Worker de produção antes do deploy.
- `modo-interprete` · P.4 · Pôr a `DEEPINFRA_API_KEY` numa perna `tts` do `IA_PROVEDORES` e rodar a sonda de contrato.
- `traducao-nuance` · 0.1 · Rodar `bancada-nuvem.yml` com os segredos do dono (`workflow_dispatch`, teto de US$ 3).
- `traducao-nuance` · 0.2 · Marcar no `IA_PROVEDORES` o modelo de `niveis: ["nuance"]` e o de `["polimento"]` com o resultado.
- `bancada-multi-modelo` · 3.4 · Segunda passada (finalistas no gold set ampliado e no FLORES): BLOQUEADA, falta conta/créditos do provedor.
- `stt-ingles-volume-e-rota` · 1.1, 5.1 · Bancada antes/depois (100 falas en e 100 pt) exige chaves de provedor.
- `cota-pelo-periodo-pago` · 3.3 · Medir em produção o tamanho do conjunto da reconciliação (com mais de 45 x 150 linhas o rodízio passa).

### Decisões de produto

- `modo-interprete` · P.1 · Decidir as cotas da voz do Premium (hoje 600.000 caracteres por mês e 60.000 por dia).
- `modo-interprete` · P.5 · Medir o `tts_inicio` com o provedor real (a meta de 2,5 s só foi conferida com simulação).
- `voz-natural-openrouter` · 6.1 · Registrar os operadores da voz (Kokoro: DeepInfra/Together; MAI: Azure) em `docs/lgpd/operadores.md`.
- `voz-natural-openrouter` · 6.3 · Decidir a mistura v4 de 3% (aceitar ou baixar a voz do Plus) e se o MAI entra no Ao Vivo com teto até 130 mil.
- `servidor-e-autoridade` · 5.2 · `/api/exercises/rodada`: decidir se entra um TETO DIÁRIO de ganho por jogo (o item continua contando para XP e Seeds; exigir cartão zeraria ganho legítimo).
- `teste-por-uso` · 2.1, 2.2, 2.3 · Decidir se os extras (aviso por uso, limite por dispositivo/rede, teto em dólar nos planos pagos) valem antes do lançamento do Plus; o 2.3 vira change nova.
- `teste-de-3-dias` · 4.3 · Decidir captcha no cadastro (Turnstile) se o abuso aparecer nos números.
- `teste-de-3-dias` · 4.4 · Atualizar `scripts/custo/modelo.mjs` (ainda modela o teste antigo de 14 dias x 2 h).
- `traducao-nuance` · 4.6 · Decidir `emTeste: false` em `server/ai/alternativas.ts` ("Outras formas" e o teste).
- `traducao-nuance` · 0.3 · Decidir se a bancada mede os prompts da Nuance.
- `gratis-sem-travar` · 9.6 · Decidir sobre o tradutor do navegador em `downloadable` (hoje o opus-mt aquece e baixa).
- `exercicios-de-frase` · 4.2 · Decidir se o `ditado` antigo e o `ditadoDeFrase` se fundem.
- `glosa-no-leitor` · 4.3 · Decidir se a glosa também usa Wiktionary/MT sob demanda.
- `teste-de-vocabulario` · 4.3 · Revisar a lista de pseudopalavras e ajustar os limiares com uso real.
- `jogo-pares-minimos` · 5.1 · Revisão das listas por falante nativo (de, fr, pt-BR) e dos rótulos fonéticos.
- `economia-legivel-e-moedas` · 2.5 · Cartão único nas 4 abas (menor, opcional).
- `interprete-historico-e-toque` · 2.6 · Nível do microfone e tamanho de letra ajustável (etapa própria, depende de dado da captura).
- `personalizar-v4` · 3.5, 3.6 · Fileira Premium do passe (coberta por `credito-com-destino`) e vitrine rotativa/desafios por minijogo (virar change própria se ainda valer).

### Outros itens abertos de dev, sem dono definido

Registrados para não se perderem; não são do dono, mas ficaram abertos nas changes arquivadas:

- `aquecer-stt-na-intencao` · 3.6, 4.2 · teste de componente da carga em voo; medir workers.
- `vocab-conhecidas-e-ignoradas` · 6.1, 6.3 · migração das marcadas no primeiro login; troca de conta para conta não dispara `aoMudarIdentidade`.
- `traducao-do-chines-pelo-ingles` · 3.1, 3.2 · normalizar tradicional/simplificada do Whisper; pivô para outros idiomas.
- `openrouter-como-provedor-de-ia` · 3.3 · dica ao Whisper para chinês simplificado.
- `importar-legendas` · 3.1, 3.2 · texto i18n do menu "Trazer uma fonte"; guardar tempos das falas.
- `cobertura-em-sessoes-e-livros` · 3.3 a 3.6 · Biblioteca, estante, ja/zh/th, `chavesConhecidas`.
- `gratis-sem-travar` · 0.8, 0.9, 0.10, 3.4, 6.5, 7.3, 9.17 · medições e VAD fora da thread principal.
- `stt-ingles-volume-e-rota` · 5.2, 5.3, 5.4 · rodada de Opus, critério e relatório em `docs/auditoria/`.
- `prontidao-producao` · fila durável da importação na nuvem (ADR 0007).
- `traducao-nuance` · 5.10 · Batch da Groq para o polimento.
- `interprete-historico-e-toque` · 5.3 · atualizar `tests/e2e/modo-interprete.e2e.ts`.
- `parciais-incrementais` · 5.3 · spike do Nemotron (fora do escopo).
- `credito-com-destino` · 5.3 · teste do 402 do import YouTube (precisa mock de yt-dlp).
- `exercicios-de-frase` · 4.1 · frases da Trilha (Tatoeba).
- `teste-de-vocabulario` · 4.1, 4.2 · convite na cobertura e outros idiomas.
- `modo-interprete` · 7.9 · folha "Rápido ou Privado?" não perguntar quando a conversa começa no automático.
- `jogo-pares-minimos` · 5.2 · mais idiomas e filtro por contraste.
- `traducao-local-pelo-ingles` · 3.2 · hindi e vietnamita.

## Parte 2. Das changes vivas e incertas

### Changes vivas

- `filtro-tutor-menores` (P1) · 4.3 · Decidir a opção C (moderação por IA) para o tutor.
- `filtro-tutor-menores` (P1) · 4.4 · Revisar as listas e acompanhar `tutor_saida_filtrada`.
- `cartoes` (P2) · Priorizar a frente de revisão espaçada frente às outras.
- `modelos-confiaveis-e-offline` (P2) · 3.4 · Pesos e ORT no R2. 5.2 · texto de privacidade. 5.3 · Web Analytics da zona. 4.5 e 6.1 · rodadas no staging.
- `planos-v3-e-rota-inteligente` (P2) · 0.3 · Conferir Asaas. Abrir venda. 11.6 · consulta jurídica.
- `porta-de-entrada` (P2) · 6.2 · Conferir no navegador com `VITE_AUTH_REQUIRED=1`.
- `traducao-local-por-direcao` (P2) · 1.2 · portão de licença. 4.3 · recrutar avaliadores brasileiros para o teste cego. Publicar no R2.
- `audiolivros` (P2) · Consulta jurídica espeak/OpenRAIL, escuta cega, bucket/CDN, aprovar a amostra de 5%, beta e rampa.
- `interprete-conversa-virtual` (P2) · Plano da conversa virtual, voz roteável do Grátis, teste real com Meet/Zoom e Discord.
- `polimento-movimento` (P2) · Aprovar a aparência do tema e da barra de cinco; decidir temas-v2 (5.3).
- `roteador-adaptativo-em-sombra` (P2) · 5.2 · Ligar a flag no staging, parecer de privacidade (`rum_latencia`) e decidir sair da sombra.
- `avatar-interprete` (P2) · 5.1 · Decisão da função `leitura_elenco`; revisão por pessoas surdas antes de `avatar_sinais`; ligar as flags depois do staging.
- `modelo-do-aluno-e-dados` (P2) · Cada fatia espera o sim do dono; as que mexem em dado gravado exigem backup e ensaio.
- `motor-anki-mapeador` (P2) · Confirmar a prioridade frente ao leitor do `.apkg` no navegador (a arquitetura mudou).
- `voz-natural-no-aparelho-kitten` (P2) · 4.3 · Publicar modelos no R2, `VITE_VOZ_KITTEN_URL` no staging, ligar `voz_kitten`, ouvir em computador, celular e Safari.
- `formatacao-e-lint-estrito` (P3) · Decidir o momento da passada geral do Prettier (muitos conflitos com outras frentes).
- `traducao-sem-rota-no-celular` (P1), `motor-anki-jogos` (P2), `tela-de-jogos-v2` (P3) · sem pendência do dono; só dev.

### Changes incertas (detalhe das perguntas em `openspec/changes/README-ordem-2026-11-23.md`)

- `ia-por-custo` (P2) · Criar segredos do Actions, rodar a bancada completa, escolher vencedores e `IA_PROVEDORES` de produção.
- `interprete-fim-de-fala-inteligente` (P2) · 5.2 · Fala real no celular/computador e decidir o padrão do fim inteligente.
- `voz-no-aparelho` (P2) · Decidir se Supertonic ou Kitten é o motor; ouvir no Safari do Mac de 6 GB; publicar pesos no R2; revisão jurídica da OpenRAIL-M.
- `economia-de-creditos` (P3) · Decidir se a visão de créditos ainda vale com os planos v3/v4 e validar Asaas em sandbox; senão abandonar.
- `interprete-ao-vivo` (P3) · 1.1 · Chave, termos e limite de custo do provedor; confirmar se a fase segue após o corte de custo de 02/10.
- `interprete-vozes-por-falante` (P3) · Reavaliar com Kokoro/OpenRouter; retomar só com clientes pagantes, ou abandonar.
- `quest-caminho-leve` (P3) · Testar no Quest, rodar `/diagnostico` e decidir threads, eco e onde fica o trabalho pesado.
- `auditoria-i18n-v1` (P3) · G0.1, G1.1 · Aceitar tabela e vereditos; decidir rede Wikidata/Tatoeba e prioridade de N3 (`?ui=`); ainda interessa ou arquiva como relatório.
- `api-e-mcp` (P3) · Decidir se a API pública/MCP entra no roadmap.
- `estrutura-por-dominio-proposta` (P3) · 2.1 · Aprovar ou recusar a árvore-alvo e a ordem.
