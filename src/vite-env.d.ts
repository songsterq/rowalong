/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev override for the share Worker origin (see src/shareConfig.ts). */
  readonly VITE_SHARE_BASE_URL?: string;
}
