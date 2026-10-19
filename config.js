// Configuração do Mashuca Wallet.
// 1) Cole aqui a configuração do app Web do seu projeto Firebase
//    (Console do Firebase > Configurações do projeto > Seus apps > App da Web).
//    Esses valores são públicos por natureza; a proteção dos dados vem das regras do Firestore.
// 2) Deixe em branco para usar o app só no modo local (dados apenas no aparelho).
window.APP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyDdrqnmNb5P7BbmgfgV4UD8LhXVOgbTJtM",
    authDomain: "mashuca-wallet.firebaseapp.com",
    projectId: "mashuca-wallet",
    storageBucket: "mashuca-wallet.firebasestorage.app",
    messagingSenderId: "790189945698",
    appId: "1:790189945698:web:092f06736e6c1eac22323b",
  },
  // Endereço do câmbio diário. No site, "fx.json" basta.
  // O workflow do Android troca automaticamente pela URL do seu GitHub Pages.
  fxUrl: "fx.json"
};
