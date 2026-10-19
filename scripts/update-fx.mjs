// Busca o câmbio de referência do Banco Central Europeu e grava www/fx.json.
// Se a busca falhar, mantém o arquivo que já existe (cópia de public/fx.json).
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL_ECB = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

try {
  const res = await fetch(URL_ECB, { headers: { "User-Agent": "mashuca-wallet-fx" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const date = (xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/) || [])[1];
  const rates = {};
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) rates[m[1]] = Number(m[2]);
  if (!date || Object.keys(rates).length < 5) throw new Error("resposta inesperada do BCE");
  mkdirSync(join(root, "www"), { recursive: true });
  writeFileSync(join(root, "www", "fx.json"), JSON.stringify({ base: "EUR", date, source: "BCE", rates }));
  console.log(`Câmbio do BCE de ${date}: ${Object.keys(rates).length} moedas`);
} catch (e) {
  console.warn("Câmbio não atualizado:", e.message);
}
