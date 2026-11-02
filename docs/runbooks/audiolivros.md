# Runbook: audiolivros e apoio à leitura

Esqueleto operacional. Spec: `docs/specs/2026-10-31-audiolivros-e-leitura.md`. Change: `openspec/changes/audiolivros/`.
Itens marcados **[PREENCHER na Fx]** só existem depois daquela fase. Nada aqui é parecer jurídico. Produção segue FECHADA: ligar flag é ato do dono.

## 1. Flags (nascem desligadas)

| Flag                 | Liga o quê                     | Exige antes                                               |
| -------------------- | ------------------------------ | --------------------------------------------------------- |
| `audiolivros`        | "Ouvir" com áudio do catálogo  | Áudio no R2 + manifesto válido (F2)                       |
| `audiolivros_nuvem`  | Voz natural para livro próprio | `voz_natural` ligada, chave do provedor, contrato G7 (F4) |
| `audiolivros_elenco` | Voz por personagem no catálogo | `audiolivros` ligada + elenco aprovado (F3)               |

Migrações: PG `0016_flags_audiolivros` e SQLite legado `0058_flags_audiolivros` (semente idempotente, `regras = '{}'`). Constantes
`FLAG_AUDIOLIVROS*` em `src/core/planos.ts`; linhas em `docs/flags.md`.

## 2. Ligar, abrir e desligar

Ligar para o dono (staging): flag com `ids` do dono e `percentual: 0` (CLI `node dist-server/operacao.cjs flags …` ou admin; ver `docs/flags.md`).
Beta: `ids` dos convidados, `percentual: 0`. Gradual: `percentual` 5 → 25 → 50 → 100, ≥ 3 dias por passo, só se as métricas do passo anterior estiverem dentro dos limites
(spec, seção 9.3). Menores só do degrau 3 em diante e depois do parecer do ECA Digital.

**Kill-switch (da mais rápida para a mais lenta):**

1. Desligar a flag (sem deploy). O leitor volta ao narrador local.
2. Nuvem: desligar `voz_natural` (503 `voz_natural_desligada`) ou `audiolivros_nuvem`.
3. R2: apontar o `manifesto.json` do livro para a versão anterior (`versao-1`). **[PREENCHER na F2: comando exato]**

## 3. Onde ficam os arquivos

- Buckets `frasy-audio` e `frasy-audio-staging` (a criar pelo dono; seguir `docs/livros-catalogo.md` §3 e `scripts/cloudflare/r2.mjs`). **[PREENCHER na F2]**
- Chave: `audiolivros/<livroId>/<voz>/<versao>/<nn>.opus`, `<nn>.json` e `manifesto.json`. Imutável por versão.
- **Ponteiro da versão (ruling F2):** o contrato do manifesto não diz qual `<versao>` usar. O cliente busca primeiro
  `audiolivros/<livroId>/<voz>/atual.json` (`{"versao": n}`, n inteiro ≥ 1), depois `manifesto.json` e os arquivos em
  `<versao>/<nn>.opus|json` (`chaveDoCapitulo`). `atual.json` inválido ou ausente = sem áudio (o narrador local lê, sem
  aviso). `gerar-livro.mjs` grava `atual.json` por ÚLTIMO, depois do manifesto.
- **Capítulo ↔ `nn` (ruling F2):** `nn` = índice da seção no leitor + 1 (a ordem dos XHTML passados ao gerador). O
  manifesto lista só os capítulos gerados; capítulo ausente do manifesto, ou com hash das frases diferente, cai no
  narrador local sem aviso.
- **Catálogo:** `scripts/audiolivros/publicados.json` (`publicar-catalogo.mjs --pasta <voz>`) → `montar-catalogo.mjs --audio`
  escreve `audio` em `public/catalogo/livros.json` (depois `npx prettier --write public/catalogo/livros.json`, o formato
  versionado).
- Domínio público do bucket e `VITE_AUDIO_URL` (CSP abre sozinha). **[PREENCHER na F2]**
- Elenco: `elenco/<livro>/<cap>.json`. **[PREENCHER na F3]**
- Segredos (`CLOUDFLARE_API_TOKEN`, `DEEPINFRA_API_KEY`, chaves de GPU): só `.env`/secrets do host, nunca versionados.

### Demonstração local (branch de demo, não mesclar)

- Dom Casmurro é `ws-pt-dom-casmurro` (Wikisource, ortografia de 1899). Só o capítulo 1 tem áudio (22 frases, voz `F1`
  PROVISÓRIA: `demo.json` ao lado do manifesto); os demais capítulos leem com a voz do aparelho, sem aviso.
- Servidor de áudio mínimo (fora do repo) com CORS `*`, `Range` (206), `Cache-Control` e
  `Cross-Origin-Resource-Policy: cross-origin` (o `<audio>` não usa `crossorigin`; com COEP ligado o R2 também
  precisa desse cabeçalho). `VITE_AUDIO_URL=http://localhost:3176`.
- **Pendência:** o título do capítulo ("I") é falado como frase e o primeiro parágrafo também começa com "I" (ouve-se
  "I. I."). Não corrigido nesta entrega: decidir se o título entra no áudio ou se o pré-processador o pula.

## 4. Gerar um livro

**[PREENCHER na F2]** Esboço:

```bash
node scripts/eval-voz/relatorio.mjs --livro <id>          # confere o motor e os limiares antes
node scripts/audiolivros/gerar-livro.mjs --livro <id> --voz <voz> --bucket frasy-audio-staging
node scripts/audiolivros/conferir.mjs --livro <id>        # hash do texto, frases sem áudio, tamanho, duração
```

Regras do lote: motor e versão no manifesto; síntese frase a frase; até 2 retentativas por frase; nenhum capítulo com frase sem áudio é publicado;
amostra de 5% ouvida pelo dono; teto de USD por lote definido antes (spec, seção 8). GPU alugada só pontual, e desligada ao terminar.

## 5. O que fazer se a qualidade cair

1. Confirmar pelo botão "Algo errado nesta frase?" (volume e livros) e pela nota média; abaixo de 3,5/5, pausar o degrau.
2. Reproduzir no capítulo e na bancada (`scripts/eval-voz`): CER, itens difíceis, estabilidade.
3. Se for o texto (nome, número, sigla): ajustar o dicionário de pronúncia/pré-processador e regerar só o capítulo (`versao+1`).
4. Se for o motor (versão nova, GPU diferente): voltar o ponteiro do manifesto à versão anterior e abrir a bancada de regressão.
5. Se persistir: desligar a flag, registrar a lição (skill `aprendizado`) e avisar o dono.

## 6. Métricas e alertas **[PREENCHER na F5]**

Limites da spec, seção 9.3 (nota ≥ 3,8/5; erro de carga ≤ 1%; abandono em 60 s ≤ 35%; 1º áudio p95 ≤ 1,5 s; US$/hora na nuvem ≤ 0,06;
R2 > 3× a previsão alerta). Painéis e consultas: **[PREENCHER]**.

## 7. Custos e orçamento

- Nuvem: `vozCaracteresMes/Dia` de `src/core/planos.ts`; orçamento global `AI_BUDGET_USD_MONTH`/`_DAY` (simular com `npm run ia:custo`).
- Lote: registrar recibo da GPU e horas geradas em `docs/pesquisa/` **[PREENCHER por lote]**.
- Teto de teste da F0: US$ 5 de GPU e US$ 2 de DeepInfra.

## 8. Checklist de abertura (assinado pelo dono)

- [ ] G1 Parecer espeak-ng (ou motor que não o usa)
- [ ] G2 Origem das vozes registrada
- [ ] G3 ECA Digital (perfil protegido, sem telemetria de escuta de menor)
- [ ] G4 LGPD: `docs/lgpd/operadores.md` e `ropa.csv` atualizados
- [ ] G5 Rótulo "Voz sintetizada" (AI Act, art. 50) visível e acessível
- [ ] G6 Direitos autorais: só PD no catálogo; livro próprio sem exportar áudio
- [ ] G7 Contrato de retenção zero do provedor de nuvem
- [ ] G8 Classificação etária respeitada
- [ ] Passeio manual no staging (Chrome, Safari, Android) e escuta aprovada
