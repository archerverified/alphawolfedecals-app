// Canonical public origin for building absolute links (share pages, QR targets).
// Mirrors the prod default used by the export pack so a share URL and the
// export-pack QR resolve to the same host.
export function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? 'https://alphawolfedecals-app-web.vercel.app';
}
