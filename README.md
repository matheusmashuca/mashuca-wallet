# Mashuca Wallet

Finanças pessoais multimoeda (contas, cartões e faturas, câmbio do BCE, importação e conciliação) para **web (GitHub Pages)** e **Android (Google Play)**, com login Google e dados no Firebase.

```
src/app.html            o aplicativo (mesmo código da versão no Claude)
config.js               configuração do Firebase e do câmbio  ← você edita
public/                 ícones, manifest, service worker, política de privacidade
scripts/build.mjs       gera www/ (site e conteúdo do app Android)
scripts/update-fx.mjs   baixa o câmbio diário do BCE para www/fx.json
scripts/android-setup.mjs  ajusta o projeto Android (login Google, versão)
assets/                 ícone e splash usados para gerar os recursos do Android
.github/workflows/      pages.yml (site + câmbio diário) e android.yml (gera o .aab)
firestore.rules         regras de segurança do banco
```

