// Descărcarea fișierelor în browser (exporturile din zona de administrare).

/**
 * O celulă CSV sigură: ghilimelele se dublează, iar textele care încep cu = + - @
 * primesc un apostrof în față, ca Excel să nu le execute ca formule (CSV injection).
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Construiește un CSV (separator „;”, ca în Excel românesc) cu BOM pentru diacritice. */
export function buildCsv(header: string[], rows: unknown[][]): Blob {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(";"));
  return new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
}

/**
 * Salvează un fișier pe calculatorul administratorului. Numele e curățat de
 * caractere nepermise (inclusiv „/” și „\\”), ca serverul să nu poată impune o cale.
 */
export function saveFile(blob: Blob, filename: string): void {
  const safeName = filename.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 120) || "export.csv";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Eliberăm memoria după ce browserul a pornit descărcarea.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
