/**
 * TAXA DE BITS DO ÁUDIO DA SESSÃO (bits/s) — o gravador ao vivo E a mistura sistema+microfone.
 *
 * Sem ela o MediaRecorder usa o padrão do navegador, que no Chrome é ~128 kbps — dimensionado para
 * MÚSICA, não para uma aula ou chamada. Opus de fala a 24–32 kbps é transparente para
 * re-transcrição (é o que a literatura de ASR sobre áudio comprimido mede), e o arquivo cai para
 * ~1/4: ~14 MB por hora em vez de ~58.
 *
 * É UMA constante, num módulo-folha, porque o valor ainda vai ser confirmado por benchmark (WER da
 * re-transcrição × taxa) e afinar tem de ser uma linha só — nos dois lugares que gravam áudio. Folha
 * para a mistura (`lib/misturarAudios`) não arrastar o VAD e o ONNX só para ler um número.
 */
export const TAXA_DE_BITS_DA_GRAVACAO = 32_000;
