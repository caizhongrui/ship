/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module '*?worker' {
  const workerCtor: {
    new (options?: { name?: string }): Worker;
  };
  export default workerCtor;
}
