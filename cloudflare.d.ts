/**
 * O único módulo do runtime da Cloudflare que o `worker.ts` usa, tipado à mão. Puxar
 * `@cloudflare/workers-types` para o tsconfig da raiz redefiniria `Request`/`Response`/`fetch` por cima das
 * libs de DOM e de Node que o resto do projeto usa (o spike S7 tinha tsconfig próprio por isso).
 */
declare module 'cloudflare:node' {
  interface ManipuladorDoWorker {
    fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
  }
  /** Liga um `http.Server` que escuta em `port` ao `fetch` do Worker. */
  export function httpServerHandler(opcoes: { port: number }): ManipuladorDoWorker;
}
