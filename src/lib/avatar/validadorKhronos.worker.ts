/**
 * O VALIDADOR glTF DA KHRONOS (`gltf-validator`, Apache-2.0) num Worker.
 *
 * VENDORIZADO, nunca por CDN: o pacote é dependência do app e o Vite o empacota num chunk PRÓPRIO, servido do
 * mesmo domínio (a CSP `script-src 'self'` já cobre; nenhuma origem nova). Rodar num Worker isola o arquivo
 * hostil da página e não trava a interface (o validador é Dart compilado para JS, ~300 KB, síncrono por dentro).
 * Nenhum recurso externo é baixado: o `externalResourceFunction` recusa tudo.
 *
 * Um Worker por validação, encerrado ao fim (`validadorKhronos.ts`).
 */

interface Pedido {
  bytes: ArrayBuffer;
}

self.onmessage = async (e: MessageEvent<Pedido>) => {
  try {
    const validador = await import('gltf-validator');
    const relatorio = await validador.validateBytes(new Uint8Array(e.data.bytes), {
      maxIssues: 50,
      externalResourceFunction: (uri) => Promise.reject(new Error(`recurso externo bloqueado: ${uri}`)),
    });
    const mensagens = (relatorio.issues?.messages ?? []).slice(0, 50).map((m) => ({
      severity: m.severity,
      code: String(m.code),
      pointer: typeof m.pointer === 'string' ? m.pointer : '',
    }));
    (self as unknown as Worker).postMessage({ ok: true, mensagens });
  } catch (erro) {
    (self as unknown as Worker).postMessage({
      ok: false,
      erro: String(erro instanceof Error ? erro.message : erro).slice(0, 200),
    });
  }
};
