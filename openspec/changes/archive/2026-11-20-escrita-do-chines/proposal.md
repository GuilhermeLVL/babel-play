## Why

O Whisper devolve chinês em caracteres simplificados (简体) ou tradicionais (繁體) conforme o provedor e o áudio, e nenhuma dica muda isso. Medido
em 17/10/2026, o mesmo áudio saiu com `氣` no DeepInfra e tudo simplificado na Groq; a dica `language: zh` não altera; um prompt em chinês
simplificado fez o DeepInfra perder uma frase. Numa mesma sessão o texto ora vinha em 简体, ora em 繁體: o vocabulário (que usa o caractere como
chave) e os cartões ficavam divididos em dois.

## What Changes

- **`src/lib/captura/escritaChinesa.ts`**: o texto de um trecho em chinês vai para a escrita da variante escolhida (`zh`, `zh-CN`, `zh-SG` →
  simplificada; `zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant` → tradicional), com `chinese-conv` 4.0.0 (MIT, ~0,6 MB, sem dependências, sem script de
  instalação), carregado sob demanda só para chinês.
- **O pipeline de fala** (`pipelineDeFala.ts`) converte o texto parcial e o final, só quando o idioma do trecho é chinês (o detectado pelo motor,
  ou a dica quando ele não disse), e pré-carrega o conversor ao preparar a captura. A variante vem do idioma configurado da fonte (a dica corta a
  região: `zh-TW` vira `zh`).

## Non-Goals

- Converter japonês, coreano ou qualquer outro idioma, ou o texto de importações (a legenda importada vem na escrita do arquivo).
- Variantes regionais de vocabulário (cabo vs. 光纤…): só a escrita dos caracteres.

## Impact

- `src/lib/captura/escritaChinesa.ts` (novo), `src/lib/captura/pipelineDeFala.ts`, `tests/escritaChinesa.test.ts`, `package.json` e `package-lock.json`
  (+1 dependência: `chinese-conv@4.0.0`, aprovada pelo dono em 17/10/2026).
- Sem custo de IA, sem mudança de servidor.
