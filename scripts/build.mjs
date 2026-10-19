// Gera a pasta www/ (site do GitHub Pages e conteúdo do app Android) a partir de src/ e public/.
// Uso: node scripts/build.mjs        (variável opcional FX_URL para o app Android)
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "www");
const FIREBASE_VERSION = "12.19.0";

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "public"), out, { recursive: true });

// config.js: copia a configuração e, se FX_URL vier do ambiente, aponta o câmbio para ela
let config = readFileSync(join(root, "config.js"), "utf8");
if (process.env.FX_URL) config = config.replace(/fxUrl\s*:\s*"[^"]*"/, `fxUrl: "${process.env.FX_URL}"`);
writeFileSync(join(out, "config.js"), config);

// Firebase: usa a cópia local do pacote npm quando existir (app Android funciona sem CDN); senão, o CDN oficial
const libs = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"];
const localDir = join(root, "node_modules", "firebase");
let scripts;
if (libs.every(f => existsSync(join(localDir, f)))) {
  mkdirSync(join(out, "vendor"), { recursive: true });
  for (const f of libs) cpSync(join(localDir, f), join(out, "vendor", f));
  scripts = libs.map(f => `<script src="vendor/${f}"></script>`).join("\n");
} else {
  scripts = libs.map(f => `<script src="https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/${f}"></script>`).join("\n");
}

// Capacitor (só quando as dependências estão instaladas, isto é, no build do Android)
const capCore = join(root, "node_modules", "@capacitor", "core", "dist", "capacitor.js");
const capAuth = join(root, "node_modules", "@capacitor-firebase", "authentication", "dist", "plugin.js");
if (existsSync(capCore) && existsSync(capAuth)) {
  mkdirSync(join(out, "vendor"), { recursive: true });
  cpSync(capCore, join(out, "vendor", "capacitor.js"));
  cpSync(capAuth, join(out, "vendor", "capacitor-firebase-auth.js"));
  scripts += `\n<script src="vendor/capacitor.js"></script>\n<script>window.firebaseAuthExports = window.firebaseAuthExports || {};</script>\n<script src="vendor/capacitor-firebase-auth.js"></script>`;
}

const app = readFileSync(join(root, "src", "app.html"), "utf8");
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1f5f7a">
<meta name="description" content="Mashuca Wallet: finanças pessoais multimoeda com contas, cartões, faturas, importação e conciliação.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
<script src="config.js"></script>
${scripts}
</head>
<body>
${app}
<script>
if ("serviceWorker" in navigator && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
</script>
</body>
</html>
`;
writeFileSync(join(out, "index.html"), html);
console.log("www/ gerado", process.env.FX_URL ? `(câmbio: ${process.env.FX_URL})` : "");
