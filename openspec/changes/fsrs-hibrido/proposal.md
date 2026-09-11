## Why

Nos três formatos reais da revisão (múltipla escolha, digitação, produção ativa) a nota FSRS era
derivada do acerto (`3` ou `1`); a grade "Errei · Difícil · Bom · Fácil" só existia num ramo que
nunca renderiza com cartão na tela (`tests/gradeDeRevisaoAlcancavel.test.ts`). A pessoa nunca dizia
ao agendador o quanto lembrou. Decisão do dono: D-006, modelo híbrido.

## What Changes

- `core/learning/notaDeRevisao.ts`: `notasOferecidas(correto, formato)` — erro trava em `Again`;
  acerto oferece `Difícil/Bom/Fácil` com a derivada pré-selecionada (`Fácil` em produção ativa, como
  `handleFsrsFeedback` já convertia); `notaFinal` decide o que vai ao servidor.
- `views/study/NotaDeRevisao.tsx`: grupo de rádio com as três notas e o intervalo de cada uma vindo
  de `previsaoDosBotoes` (o agendador real).
- `Study.tsx`: nos três formatos, após um acerto o grupo aparece e "Avançar" envia a nota marcada;
  a conversão "produção ativa vale Easy" sai do handler (moraria duas vezes).
- `activeProduction.tsx`: prop `notaAntesDeAvancar` entre o veredito e "Próximo".
- Testes: função pura (7), componente (3), E2E novo em `fsrs-revisao` (acertar, escolher Fácil, avançar).

## Nao-escopo

O servidor não muda: `POST /api/vocab/:id/review` já aceita 1–4 (`reviewGradeSchema`). O ramo morto
do flashcard e o `scheduler` sem setter ficam para uma limpeza própria (registrado em LACUNAS).
