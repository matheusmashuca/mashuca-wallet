# Mashuca Wallet

Finanças pessoais multimoeda (contas, cartões e faturas, câmbio do BCE, importação e conciliação) para **web (GitHub Pages)** e **Android (Google Play)**, com login Google e dados no Firebase.

```
bank-worker/            servidor de conexão bancária (Cloudflare Worker)
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

---

## 1. Firebase (login Google e banco)

1. Em <https://console.firebase.google.com> crie um projeto (ex.: `mashuca-wallet`).
2. **Authentication › Sign-in method**: ative **Google**.
3. **Firestore Database**: crie o banco em modo produção (região `eur3` ou `europe-west`). Em **Regras**, cole o conteúdo de `firestore.rules` e publique.
4. **Configurações do projeto › Seus apps › Web (`</>`)**: registre um app Web e copie o objeto `firebaseConfig` para `config.js`.
5. **Authentication › Settings › Authorized domains**: adicione `SEU_USUARIO.github.io` (`localhost` já vem incluído e é o que o app Android usa).

## 2. Site no GitHub Pages

1. Crie um repositório (ex.: `mashuca-wallet`) e envie todos os arquivos deste pacote.
2. **Settings › Pages › Source: GitHub Actions**.
3. Cada push na branch `main` publica o site em `https://SEU_USUARIO.github.io/mashuca-wallet/`. O mesmo workflow roda todo dia útil às 15h40 UTC para atualizar o câmbio do BCE.
4. No celular, abra o site e use **Adicionar à tela inicial**: ele funciona como app (PWA).

**Trazer os dados da versão no Claude:** no app do Claude, *Cadastros › Backup › Exportar backup (JSON)*; no novo site, entre com Google e use *Importar backup*.

## 3. App Android

### 3.1 Chave de upload (uma vez, guarde com cuidado)

**Sem Java no computador:** crie o secret `ANDROID_KEYSTORE_PASSWORD` (senha forte) e rode **Actions › Criar chave Android (rodar uma vez)**. O resumo da execução mostra o SHA-1 e o SHA-256; o artefato `chave-android-GUARDAR` (disponível por 1 dia) traz o `upload.jks` para você guardar e o `ANDROID_KEYSTORE_BASE64.txt` para o secret de mesmo nome. Use `upload` como alias e a mesma senha em `ANDROID_KEY_PASSWORD`.

**Com Java instalado:**

```bash
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
keytool -list -v -keystore upload.jks -alias upload   # anote o SHA-1 e o SHA-256
```

### 3.2 Firebase para Android

1. **Configurações do projeto › Adicionar app › Android**, pacote `com.mashuca.wallet` (o mesmo de `capacitor.config.json`).
2. Cadastre o **SHA-1** e o **SHA-256** da chave de upload.
3. Baixe o `google-services.json`.

### 3.3 Secrets do repositório (*Settings › Secrets and variables › Actions*)

| Secret | Conteúdo |
|---|---|
| `GOOGLE_SERVICES_JSON` | conteúdo inteiro do `google-services.json` |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 upload.jks` (no macOS: `base64 -i upload.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | senha do keystore |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | senha da chave |

### 3.4 Gerar o app

**Actions › Gerar app Android › Run workflow**, informe a versão (ex.: `1.0.0`). Ao terminar, baixe o artefato com:

- `mashuca-wallet-1.0.0-N.aab` → enviar para a Play Store (o `versionCode` sobe sozinho a cada execução);
- `mashuca-wallet-1.0.0-teste.apk` → instalar direto no celular para testar (assinado com a chave de upload, então o login Google funciona).

Também dá para gerar criando uma tag: `git tag v1.0.1 && git push --tags`.

**Alternativa no computador** (Node 22, JDK 21, Android Studio):

```bash
npm install
npm run build
cp /caminho/google-services.json .
npm run android:add      # cria a pasta android/ e já ajusta login Google e versão
npm run android:icons
npx cap sync android
npm run android:open     # Build › Generate Signed App Bundle
```

## 4. Publicar na Google Play

1. Crie a conta em <https://play.google.com/console> (taxa única de registro).
2. **Criar app**: nome *Mashuca Wallet*, app gratuito.
3. **Política de privacidade**: `https://SEU_USUARIO.github.io/mashuca-wallet/privacy.html` (edite o e-mail de contato em `public/privacy.html`).
4. **Exclusão de conta**: informe o mesmo link com `#exclusao`; o app tem *Cadastros › Backup › Excluir minha conta e dados*.
5. **Segurança dos dados**: coleta de nome, e-mail e informações financeiras fornecidas pelo usuário; criptografia em trânsito; exclusão disponível; dados compartilhados só com pessoas que o próprio usuário convida.
6. Preencha **Recursos financeiros** (app de controle pessoal, sem serviços financeiros), **Classificação de conteúdo** e **Público-alvo**.
7. **Teste › Teste fechado**: envie o `.aab`. Contas pessoais novas precisam de um período de teste fechado com testadores antes de liberar produção; o Play Console mostra os requisitos atuais.
8. **Assinatura de apps pelo Google Play**: após o primeiro envio, copie o **SHA-1 e SHA-256 da chave de assinatura do app** (Configuração › Integridade do app) e adicione no Firebase (app Android). Baixe de novo o `google-services.json` e atualize o secret. Sem isso, o login Google falha no app instalado pela loja.
9. Requisito de API: a partir de 31/08/2026 apps novos e atualizações precisam mirar o Android 16 (API 36). O projeto usa Capacitor 8, que já gera `targetSdkVersion = 36`.

## 5. Compartilhar contas e cartões (ex.: com a esposa)

1. Em **Cadastros › Contas**, edite a conta ou o cartão e, em **Compartilhar com**, adicione o e-mail da conta Google da outra pessoa. Salve.
2. A pessoa abre o mesmo site (ou o app Android) e entra com essa conta Google. Na primeira vez ela faz o cadastro de perfil; as contas compartilhadas aparecem em seguida, marcadas "de <seu nome>".
3. Os dois veem, lançam, conciliam e pagam faturas na conta compartilhada. Só quem compartilhou altera o cadastro (limite, datas, nome) ou exclui a conta. A outra pessoa pode **Sair do compartilhamento** no cadastro da conta.
4. Lançamentos de conta compartilhada usam as categorias de quem compartilhou. Transferências entre a conta pessoal de um e a conta compartilhada aparecem para os dois; a conta pessoal continua privada.
5. As regras em `firestore.rules` garantem isso no servidor: publique a versão nova delas no Firebase.

Na versão dentro do Claude o compartilhamento não está disponível; ele depende do login Google da versão publicada.

## 6. Atualizar

- Mudou o app? Edite `src/app.html` e faça push: o site atualiza sozinho. Para o Android, rode o workflow de novo e envie o novo `.aab`.
- Teste local: `npm run build && npm run serve` → <http://localhost:8080>.

## 7. Conexão automática com bancos (opcional)

O app busca transações e saldos direto dos bancos e manda tudo para a tela **Importar**, onde a conciliação de sempre funciona: o que já existe é conciliado, o resto vira lançamento novo, e nada é gravado sem você confirmar. O acesso é **só leitura**.

| Onde | Agregador | Custo |
|---|---|---|
| França e UE (PSD2) | Enable Banking, modo "contas vinculadas" | uso pessoal e não comercial, sem contrato; confira as condições no painel |
| Brasil (Open Finance) | Pluggy, via Meu Pluggy | conexão das suas contas gratuita; planos comerciais são pagos |
| Servidor que guarda as chaves | Cloudflare Workers | plano gratuito (100 mil chamadas por dia), sem cartão |

As chaves dos agregadores **nunca** ficam no app nem no GitHub: só no servidor. O servidor só atende o seu site, só aceita o seu login Google (lista de e-mails) e só devolve transações e saldos.

### 7.1 Servidor (Cloudflare Worker), tudo pelo navegador

1. Crie uma conta grátis em <https://dash.cloudflare.com>.
2. **Workers & Pages › Create › Start with Hello World**, nome `mashuca-bank`, **Deploy**.
3. **Edit code**: apague o exemplo, cole todo o conteúdo de `bank-worker/worker.js` e clique em **Deploy**.
4. **Settings › Variables and Secrets › Add**, como *Text*:
   - `ALLOWED_ORIGINS` = `https://SEU_USUARIO.github.io,https://localhost`
   - `FIREBASE_PROJECT_ID` = o ID do projeto Firebase (o mesmo `projectId` do `config.js`)
   - `ALLOWED_EMAILS` = seu e-mail Google (e o da sua esposa, separados por vírgula)
5. Anote o endereço do Worker (ex.: `https://mashuca-bank.seu-usuario.workers.dev`). Abrir `…/health` no navegador deve mostrar `{"ok":true,…}`.

Alternativa: com os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no GitHub, o workflow **Publicar servidor bancário** publica o Worker sozinho a cada mudança em `bank-worker/`.

### 7.2 França e UE: Enable Banking

1. Crie a conta em <https://enablebanking.com> e abra o **Control Panel**.
2. **Applications › Register new application**: ambiente **Production**; em *Redirect URLs* coloque `https://SEU_USUARIO.github.io/mashuca-wallet/`; gere a chave no navegador e **guarde o arquivo .pem** que é baixado.
3. Clique em **Activate by linking accounts** e autorize, no site de cada banco, as contas que você vai usar (Boursorama, Caisse d'Epargne…). Só contas vinculadas ficam acessíveis.
4. No Worker, adicione como **Secret**:
   - `EB_APP_ID` = o ID da aplicação
   - `EB_PRIVATE_KEY` = todo o conteúdo do .pem (de `-----BEGIN PRIVATE KEY-----` até o fim)

### 7.3 Brasil: Pluggy

1. Crie a conta em <https://dashboard.pluggy.ai>, crie um time e uma aplicação; copie **Client ID** e **Client Secret**.
2. No Worker, adicione como **Secret**: `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`.
3. Em <https://meu.pluggy.ai>, conecte seus bancos (Nubank, Itaú, Bradesco…) com a autorização no app do banco. Faça isso enquanto o período de teste da conta de desenvolvedor estiver ativo; as conexões continuam depois dele.
4. No painel da Pluggy: sua aplicação › **Ir para Demo** › menu ⋮ do banco › **Copiar Item ID**. Um Item ID por banco.

### 7.4 No app

1. **Cadastros › Conexões bancárias**: cole o endereço do Worker, **Salvar** e **Testar servidor** (mostra se França/UE e Brasil estão prontos).
2. **+ França / UE**: escolha o país e o banco, **Ir para o banco**, autorize e você volta ao app. Faça isso pelo **site** (no app Android o retorno do banco abre o navegador).
3. **+ Brasil**: cole o Item ID.
4. Ligue cada conta do banco a uma conta ou cartão do app e clique em **Salvar e sincronizar**. As transações aparecem em **Importar** para revisão.
5. Com **Sincronizar ao abrir o app** ligado, o app busca novidades a cada 6 horas e avisa quando há lançamentos para revisar.
6. O consentimento PSD2 dura até 180 dias; o app avisa 10 dias antes e o botão **Renovar** refaz a autorização mantendo as ligações das contas.

Para conhecer o fluxo sem configurar nada, digite `demo` no endereço do servidor: o app simula um banco francês e um brasileiro com os seus próprios dados.

### O que a conciliação faz com os dados do banco

- **Valor e data iguais** a um lançamento seu: conciliação automática, que fica "A validar" no painel.
- **Já conciliado antes** por arquivo OFX ou CSV: a linha vem desmarcada, para não duplicar, e o app lembra dela nas próximas sincronizações.
- **Uma linha do banco que paga vários lançamentos** (débito agrupado, fatura): botão **Vários…**; **Sugerir combinação** acha os lançamentos que somam o valor, e a diferença (tarifa, juros) pode virar um lançamento com categoria.
- **Lançamento novo**: categoria pelos padrões (aceitam alternativas, `ifood | rappi`) ou, sem padrão, pelo histórico dos seus lançamentos parecidos.
- **Saldo**: o saldo informado pelo banco (conexão ou OFX) aparece no extrato da conta, com a diferença para o saldo do app e o botão Ajustar saldo.

## Observações

- Sem configuração do Firebase, o app funciona no **modo local** (dados só no aparelho).
- O câmbio vem do BCE; ARS e UYU não são publicadas por ele e usam a cotação manual.
- A leitura automática de notificações no Android exige um plugin nativo e ainda não está incluída; a importação colando o texto funciona normalmente.
