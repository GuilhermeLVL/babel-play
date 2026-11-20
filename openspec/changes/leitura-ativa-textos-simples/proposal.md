## Por quê

Nenhum concorrente encontrado junta, para quem fala português, textos simples graduados, leitura em voz alta
acompanhada no próprio aparelho, integração com o vocabulário que a pessoa já salvou e perfil protegido de
menor (`reports/Leitura ativa de textos simples.md`). Os leitores para aprendizes (LingQ, Readlang) não ouvem a
pessoa ler; os tutores que ouvem (Google Read Along, Microsoft Reading Coach) ensinam crianças nativas. O Frasy
já tem quase todas as peças (narração, cartão da palavra, etiquetas, FSRS, missões, reconhecimento local, núcleo
de IA com retenção zero). Falta pouco: uma tela, um alinhador de leitura e uma função de IA para a escrita. O
dono pediu o protótipo em 18/11/2026, com autonomia e atrás de flag.

## O que muda

- Tela nova **Leituras** (`/leitura` e `/leitura/<textoId>`), só com a flag `leitura_ativa` ligada (desligada
  por padrão, migração nas duas cadeias). Desligada, o item do menu não aparece, a rota cai no início e a API
  de escrita responde 404.
- **Acervo inicial de 12 textos originais** (4 em A1, 4 em A2, 4 em B1), licença CC BY 4.0 da equipe Frasy,
  com ficha (licença, autoria, selo "criado com IA e revisado"), 3 perguntas e 2 tarefas de escrita por texto.
- **"Você já sabe X%"** e nível sugerido calculados no aparelho, por listas (CEFR-J do app, palavras
  funcionais, etiquetas de palavra), sem embeddings e sem rede. Sem histórico suficiente, não mostra número.
- **Três modos de leitura**: ouvir primeiro (narração com destaque por frase), ler em voz alta (destaque ao
  vivo palavra por palavra) e ler em silêncio.
- **Alinhador de leitura** puro novo: cursor que só avança, janela curta à frente, estados `pendente`,
  `atual`, `lida` e `pulada`. "Pulada" aparece como "O Frasy não ouviu bem", nunca como erro.
- **Voz só no aparelho**: microfone só por toque explícito, reconhecimento local (`processLocally` ou modelo
  local), nunca nuvem nesta tela; áudio só em memória e descartado a cada frase; nada guardado além do
  resultado em texto.
- **3 perguntas por texto** corrigidas no aparelho, com segunda tentativa e sem "errado".
- **Palavras para praticar** (até 5: puladas, tocadas e novas) que a pessoa pode mandar à revisão (FSRS).
- **Escrita** (reescrever ou opinar): nos planos pagos, retorno da função de IA nova `escrita` (no máximo 3
  pontos + 1 elogio, sem reescrever o texto), com cota `escritasMes`, retenção zero, instrução para menores e
  filtro de dados pessoais antes de enviar. No grátis, "Conferir sozinho" faz uma checagem local e diz, sem
  pressão de venda, que o retorno da IA é dos planos pagos.
- **Missão do dia** `leitura` ("Leia 1 texto"), só sorteada com a flag ligada.

## Capacidades

### Capacidades novas

- `leitura-ativa-acesso`: flag `leitura_ativa`, rota, item de menu e o que muda para o perfil protegido.
- `leitura-ativa-acervo`: o acervo de textos curtos, a ficha de cada texto e a cobertura/nível no aparelho.
- `leitura-ativa-voz-alta`: ler em voz alta com destaque ao vivo, o alinhador e as regras de privacidade da voz.
- `leitura-ativa-perguntas-e-pratica`: perguntas de compreensão, palavras para praticar, revisão e missão.
- `leitura-ativa-escrita`: reescrever/opinar, filtro de dados pessoais, retorno da IA, cota e checagem local.

### Capacidades modificadas

Nenhuma. A cota nova entra em `src/core/planos.ts` como requisito da capacidade `leitura-ativa-escrita`; as
specs antigas de planos (`matriz-de-planos`, `planos-e-billing`) descrevem uma matriz já superada e não mudam
de requisito aqui.

## Fora do escopo

- Retorno de pronúncia pelo som (GOP/fonemas), nota de precisão e "palavra trocada" na tela: dependem de medir
  o reconhecimento com brasileiros lendo.
- Acervos externos (StoryWeaver, VOA, Tatoeba), notícias, o mesmo texto em 3 níveis, texto gerado sob medida.
- Outros idiomas além do inglês; busca por tema com embeddings; ranking ou comparação entre pessoas.
- Ligar a flag em produção ou no staging (decisão do dono).

## Suposições para o dono validar

O dono estava ausente quando esta spec foi escrita (18/11/2026). Estas decisões são provisórias, tomadas para
o protótipo andar; todas ficam atrás da flag desligada e podem mudar sem custo de produção.

1. **Acervo**: só os 12 textos originais (4 A1, 4 A2, 4 B1), CC BY 4.0 da equipe Frasy, escritos com apoio de
   IA e revisados por juiz automático; falta a revisão humana do dono. StoryWeaver e VOA ficam para depois.
   Não há "o mesmo texto em 3 níveis" (cada texto tem um nível só).
2. **Selo "Criado com IA e revisado por pessoas"** aparece em todos os textos.
3. **Nível e cobertura** no aparelho, por listas e etiquetas, sem embeddings; sem número com menos de 3 sessões.
4. **Voz alta para menores**: liberada com aviso a cada sessão, sem exigir consentimento dos pais registrado.
   Falta parecer jurídico sobre voz de menor processada só no aparelho e sem gravação.
5. **Retorno de pronúncia pelo som fica fora**; a tela só diz "O Frasy não ouviu bem", sem nota.
6. **3 perguntas por texto**, de múltipla escolha (sem cloze e sem verdadeiro/falso no MVP).
7. **Escrita com IA só nos planos pagos**, `escritasMes` = 30 nos pagos e 0 no grátis (número provisório; o
   grátis tem "Conferir sozinho"). Um reenvio por texto.
8. **Missão nova `leitura`** ("Leia 1 texto"), só sorteada com a flag ligada; leitura dá XP pelo caminho das
   rodadas, sem tipo novo de jogo.
9. **Palavras por minuto** aparecem só para adultos, só no modo voz alta.
10. **Item no menu "Mais"**, fora do trilho do computador (entrar no trilho é decisão do dono).
11. **Modelo da escrita** sai de juízes via `claude -p` com 30–50 textos próprios antes de ligar a flag; até lá,
    testes só com IA simulada.

## Impacto

- Código: `src/core/leitura/` (alinhador, cobertura, conferência local da escrita, filtro de dados pessoais),
  `src/data/leitura/textos.json`, `src/components/views/leituraAtiva/`, `src/lib/rotas.ts`, `src/types.ts`,
  `src/App.tsx`, `src/components/shell/`, `src/core/planos.ts` (flag e cota), `src/core/missoes.ts`,
  `server/ai/funcoesDeIa.ts`, `server/ai/nucleo/escrita.ts`, `server/routes/ai.ts`, migrações
  `server/db/migrations-pg/0020_flag_leitura_ativa.sql` e `server/db/migrations-sqlite/0062_flag_leitura_ativa.sql`,
  catálogos `public/i18n/*.json`.
- API: `POST /api/ai/escrita` (nova, 404 com a flag desligada).
- Custo: menos de US$ 0,01 por pessoa paga por mês na escrita; zero na leitura (tudo no aparelho). Nenhuma
  chamada de IA paga durante o desenvolvimento (testes com IA simulada).
