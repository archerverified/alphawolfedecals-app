// Background removal via Replicate's cjwbw/rembg model (GH-005). No self-host.
//
// Fallback policy (see ADR-0009 §rembg): if the Replicate call fails for any
// reason (no token, model error, network), we DO NOT fail the whole parse — we
// fall back to the un-removed PNG and record the failure in parse_metadata, so a
// transient Replicate outage degrades to "background not removed" rather than a
// dead asset the user must re-upload.

import Replicate from 'replicate';

// Pinned model version for reproducibility; override via env if the model is
// re-published. cjwbw/rembg is a standard U^2-Net background remover.
const DEFAULT_REMBG_VERSION = 'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';

export interface RembgResult {
  buffer: Buffer;
  removed: boolean;
  error?: string;
}

export async function removeBackground(pngBuffer: Buffer): Promise<RembgResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return { buffer: pngBuffer, removed: false, error: 'REPLICATE_API_TOKEN not set' };
  }
  try {
    const replicate = new Replicate({ auth: token });
    const version = process.env.REMBG_MODEL_VERSION ?? DEFAULT_REMBG_VERSION;
    const dataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    const output = await replicate.run(`cjwbw/rembg:${version}`, { input: { image: dataUri } });
    const url = Array.isArray(output) ? String(output[0]) : String(output);
    if (!url || !/^https?:\/\//.test(url)) {
      return { buffer: pngBuffer, removed: false, error: 'rembg returned no image url' };
    }
    const resp = await fetch(url);
    if (!resp.ok) {
      return { buffer: pngBuffer, removed: false, error: `rembg fetch ${resp.status}` };
    }
    return { buffer: Buffer.from(await resp.arrayBuffer()), removed: true };
  } catch (err) {
    return {
      buffer: pngBuffer,
      removed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
