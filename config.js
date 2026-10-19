// Configuração do Mashuca Wallet.
// 1) Cole aqui a configuração do app Web do seu projeto Firebase
//    (Console do Firebase > Configurações do projeto > Seus apps > App da Web).
//    Esses valores são públicos por natureza; a proteção dos dados vem das regras do Firestore.
// 2) Deixe em branco para usar o app só no modo local (dados apenas no aparelho).
window.APP_CONFIG = {
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  // Endereço do câmbio diário. No site, "fx.json" basta.
  // O workflow do Android troca automaticamente pela URL do seu GitHub Pages.
  fxUrl: "fx.json"
};
