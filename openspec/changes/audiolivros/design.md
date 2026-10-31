## Context

Detalhe completo em `docs/specs/2026-10-31-audiolivros-e-leitura.md` (arquitetura, bancada, custos, abertura, legal). Este arquivo registra
só as decisões e as alternativas. O app já tem: `Narrador` por frase (Web Speech), `voz_natural` (`POST /api/ai/tts`) com cotas
`vozCaracteresMes/Dia`, heurística de elenco e `planejarElenco(..., previas)`, catálogo de 328 livros PD (`public/catalogo/livros.json`),
buckets R2 de livros e mídia, flags com `ids`/`percentual`.

## Goals / Non-Goals

**Goals:** áudio do catálogo pré-gerado, sincronizado por frase, com custo único; livro próprio no aparelho; bancada e limiares; abertura segura.
**Non-Goals:** ver `proposal.md`.

## Decisions

1. **Pré-gerar o catálogo (T1) em vez de TTS sob demanda para todos.** Catálogo fixo, custo único (US$ 4,7 a ~2,7 mil conforme escopo e
   caminho, ESTIMATIVA) e ~US$ 0,5/mês de R2, contra ~US$ 54/mês por 1.000 horas ouvidas sob demanda. Alternativas: só Web Speech
   (sem diferencial); sob demanda (linear no uso, latência, terceiro lendo texto).
2. **JSON de tempos por frase, não SMIL.** Casa com o `Intl.Segmenter` do app e o índice do elenco; valida por hash do texto. SMIL fica
   como exportação futura.
3. **Sincronia por síntese frase a frase.** A duração do clipe é o tempo; sem alinhador. WhisperX/MFA só como plano B.
4. **Motor decidido na F0 por critério numérico**, sem espeak-ng no caminho distribuído. Kokoro/Piper só com parecer.
5. **Livro do usuário no aparelho; nuvem só Premium com consentimento por livro e as cotas existentes.** Sem novo campo em `planos.ts` no MVP.
6. **Elenco gerado offline por `claude -p`/`agy -p`** (zero de API) e validado por `validarMarcacaoDaIa`; gold set nosso antes de confiar.
7. **Três flags independentes, desligadas.** Flag é interruptor de produto; direito e cota seguem no entitlement e no servidor.
8. **Opus 32 kbps mono; AAC como segunda faixa se o Safari exigir.** Bucket próprio `frasy-audio`.
9. **Quem decide a voz é o ouvido do dono + limiar.** O limiar elimina; o juiz por LLM só olha o texto.

## Risks / Trade-offs

- Nenhum motor aceitável em pt-BR: F0 barata (teto US$ 5) e plano B (T2 + voz do aparelho).
- Parecer jurídico demorado: os motores candidatos não dependem dele.
- RTF desconhecido: custo do lote em duas hipóteses; lote por escopo crescente.
- Texto muda e áudio desalinha: manifesto com hash e queda para o narrador local.
- UI poluída: um botão "Ouvir"; o resto em "Voz e modo".
- Menores: classificação etária, sem nuvem de livro próprio, sem telemetria de escuta.
