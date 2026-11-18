import { Index } from '@upstash/vector';

export interface VectorMetadata {
  gameId?: string;
  name?: string;
  category?: string;
  engine?: string;
  [key: string]: unknown;
}

let cachedIndex: Index<VectorMetadata> | null = null;

export function isUpstashVectorConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_VECTOR_REST_URL?.trim() &&
      process.env.UPSTASH_VECTOR_REST_TOKEN?.trim(),
  );
}

/**
 * Returns a lazy singleton Upstash Vector client configured via
 * UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN.
 */
export function getVectorIndex(): Index<VectorMetadata> {
  if (!cachedIndex) {
    cachedIndex = Index.fromEnv() as Index<VectorMetadata>;
  }
  return cachedIndex;
}

export { Index };
