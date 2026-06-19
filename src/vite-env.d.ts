/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** storage driver の切替。`fs` で filesystem driver、未設定なら IndexedDB。 */
  readonly VITE_STORAGE_DRIVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
