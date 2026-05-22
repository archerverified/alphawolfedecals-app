// Shared types for the parse pipeline (GH-005).

export interface ParseAssetOptions {
  /** Run background removal (Replicate rembg) on raster inputs. */
  rembg?: boolean;
}

// The single job contract. Carries everything the worker needs to fetch the
// source from Storage, convert it, write the result back, and update the DB row
// under the owning user's RLS scope.
export interface ParseAssetPayload {
  assetId: string;
  ownerUserId: string;
  projectId: string;
  /** Bucket-relative key of the uploaded original in the project-assets bucket. */
  sourceKey: string;
  mimeType: string;
  options?: ParseAssetOptions;
}

export type ParseOutcome =
  | { status: 'parsed'; parsedKey: string }
  | { status: 'failed'; error: string }
  | { status: 'queued_missing_cli'; missing: string };

export const PARSE_QUEUE_NAME = 'parse-asset' as const;
