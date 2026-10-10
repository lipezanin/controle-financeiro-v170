/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

declare module "*.sql?raw" {
  const conteudo: string;
  export default conteudo;
}

declare module "*.json?raw" {
  const conteudo: string;
  export default conteudo;
}

declare module "*.wasm?url" {
  const url: string;
  export default url;
}

declare module "*.css?inline" {
  const css: string;
  export default css;
}
