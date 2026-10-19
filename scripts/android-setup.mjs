// Ajusta o projeto Android gerado pelo Capacitor (pasta android/).
// - liga o login Google do plugin @capacitor-firebase/authentication
// - define versionCode/versionName (variáveis VERSION_CODE e VERSION_NAME)
// - copia google-services.json da raiz do projeto, se existir
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vars = join(root, "android", "variables.gradle");
const app = join(root, "android", "app", "build.gradle");
if (!existsSync(vars)) { console.error("Pasta android/ não encontrada. Rode antes: npx cap add android"); process.exit(1); }

let v = readFileSync(vars, "utf8");
if (!/rgcfaIncludeGoogle/.test(v)) { v += "\next {\n    rgcfaIncludeGoogle = true\n}\n"; writeFileSync(vars, v); }

let g = readFileSync(app, "utf8");
if (process.env.VERSION_CODE) g = g.replace(/versionCode \d+/, `versionCode ${process.env.VERSION_CODE}`);
if (process.env.VERSION_NAME) g = g.replace(/versionName "[^"]*"/, `versionName "${process.env.VERSION_NAME}"`);
writeFileSync(app, g);

const gs = join(root, "google-services.json");
if (existsSync(gs)) copyFileSync(gs, join(root, "android", "app", "google-services.json"));
else if (!existsSync(join(root, "android", "app", "google-services.json"))) console.warn("Aviso: google-services.json ausente; o login Google no Android não vai funcionar.");

console.log("Projeto Android ajustado", process.env.VERSION_CODE ? `(versão ${process.env.VERSION_NAME} / ${process.env.VERSION_CODE})` : "");
