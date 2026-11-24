export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

export function makeExportPrefix(badge: string | undefined): { ts: string; vibeSlug: string } {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const vibeSlug = (badge || 'y2k').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { ts, vibeSlug };
}
