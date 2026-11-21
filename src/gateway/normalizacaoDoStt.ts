/**
 * A FLAG `stt_nuvem_normalizar` COMO O ADAPTADOR DE NUVEM A VÊ (openspec `stt-ingles-volume-e-rota`, tarefa 3.2/3.3).
 *
 * O `GroqWhisperStt` é singleton criado pelo gateway, longe de quem lê as flags. O gateway não importa de `src/lib`, então
 * quem lê a flag (`lib/captura/pipelineDeFala.ts`) a deposita aqui e o adaptador consulta ao enviar. Padrão DESLIGADO:
 * sem chamada, o corpo enviado é byte a byte o de antes.
 */
let ligada = false;

export function definirNormalizacaoDoStt(valor: boolean): void {
  ligada = valor === true;
}

export function normalizacaoDoSttLigada(): boolean {
  return ligada;
}
