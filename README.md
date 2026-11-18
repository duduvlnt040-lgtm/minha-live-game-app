# MINHA LIVE GAMES

Plataforma SaaS profissional para administrar, importar e executar jogos interativos (HTML5, Phaser 3 e Three.js) conectados a eventos em tempo real e overlays para OBS Studio e TikTok LIVE Studio.

## Principais funcionalidades

- **Site institucional completo**: apresentação, recursos, fluxo de uso, planos e FAQ em interface escura grafite com identidade própria.
- **Autenticação e controle de acesso (RBAC)**: cadastro (nome, usuário, e-mail, senha e confirmação), login, logout, recuperação de senha e sessões persistentes com hash criptográfico (`scrypt`). O papel é resolvido e validado exclusivamente no servidor (`ADMIN` vs `USER`).
- **Biblioteca global centralizada**: começa vazia por padrão. Somente o administrador pode importar (`.html` / `.zip`), criar no estúdio, editar, excluir, publicar e despublicar jogos. Jogos publicados ficam automaticamente disponíveis na biblioteca de todos os usuários para execução, adição em **Meus jogos** e transmissão via overlay.
- **Player isolado & Estúdio de criação**: execução em `iframe` sandboxed (`allow-scripts`) com suporte local a **Phaser 3** e **Three.js**, controles de iniciar, pausar, reiniciar, áudio e tela cheia, e comunicação via SDK `window.MinhaLiveGames`.
- **Overlays independentes (`/overlay/:id`)**: abrem fora do dashboard, funcionam como Fonte de Navegador no OBS/TikTok LIVE Studio, recebem eventos em tempo real via WebSocket e exibem a marca-d'água configurável `MINHA LIVE GAMES`.
- **Editor visual de regras e Modo Simulação**: regras `QUANDO → AÇÃO` para presentes, curtidas, comentários, seguidores, compartilhamentos, quantidade de presentes, palavras-chave, bônus e pontuação, com histórico e simulador dedicado.
- **Integração TikTok LIVE desacoplada**: adaptador isolado que nunca simula status conectado falso e documenta o uso de `tiktok-live-connector`.
- **Planos e Administração**: limites por plano (`Gratuito`, `Premium`, `Pro`), área administrativa protegida no servidor e interface preparada para Mercado Pago.

## Estrutura de pastas

```text
├── public/                 # Ícone SVG da aplicação
├── server/                 # Store persistente, adaptador TikTok LIVE e adaptador de pagamento
├── server.ts               # Servidor Express + WebSocket + Vite middleware
├── src/
│   ├── components/         # BrandMark, GamePlayer e módulos do Dashboard
│   ├── context/            # AuthContext (sessão real)
│   ├── lib/                # Motor de regras, validador ZIP/HTML, RBAC, limites de plano e testes
│   ├── pages/              # LandingPage, AuthPages, DashboardPage, OverlayPage
│   ├── services/           # Cliente API e StorageAdapter (IndexedDB local)
│   └── types/              # Contratos TypeScript da plataforma
├── .env.example            # Variáveis de ambiente documentadas
└── vercel.json             # Configuração de build e rewrites para Vercel
```

## Instalação local e conta Administrador

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Copie `.env.example` para `.env` e ajuste os valores desejados:
   ```bash
   cp .env.example .env
   ```
   - Por padrão, `ADMIN_EMAIL` está configurado como `duduvlnt040@gmail.com`.
   - Ao cadastrar a conta com esse e-mail em `/cadastro` (com sua própria senha escolhida no formulário), o servidor atribui automaticamente o papel `admin` (`ADMIN`). Caso essa conta já exista no banco local, o próximo login promove o registro automaticamente para `admin`.
   - Qualquer outro e-mail cadastrado recebe automaticamente o papel `user` (`USER`) sem possibilidade de auto-promoção pelo frontend.
3. Execute os testes unitários:
   ```bash
   npm test
   ```
4. Inicie o servidor em modo desenvolvimento (porta `3000`):
   ```bash
   npm run dev
   ```

## Como conectar o Firebase (Opcional / Produção)

Nesta primeira versão local, a plataforma utiliza autenticação criptográfica no servidor Node.js e armazenamento local (IndexedDB + disco do servidor) sem exigir serviços pagos ou credenciais externas.

Para conectar seu próprio projeto **Firebase Authentication** e **Cloud Firestore** em produção:
1. Acesse o [Firebase Console](https://console.firebase.google.com/) e crie um projeto no plano gratuito **Spark**.
2. Ative **Authentication** (provedor E-mail/Senha) e crie um banco **Cloud Firestore**.
3. Copie as credenciais Web (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) para as variáveis `VITE_FIREBASE_*` no seu `.env` ou nas configurações da Vercel.
4. Configure regras de segurança do Firestore restringindo leitura/escrita ao `request.auth.uid` do proprietário do documento e mantendo arquivos grandes no Storage ou IndexedDB.

## Integração TikTok LIVE (Produção)

O TikTok LIVE não disponibiliza uma API WebSocket pública oficial para captura de presentes/chat sem aprovação de parceiro. O adaptador em `server/tiktokAdapter.ts` está desacoplado do restante da aplicação. Para conectar salas reais em um worker Node.js persistente:
```bash
npm install tiktok-live-connector
```
*Nota: ambientes serverless puros (como funções curtas na Vercel) não mantêm conexões WebSocket de longa duração para scraping do TikTok; recomenda-se hospedar o worker WebSocket em um processo Node contínuo.*

## Deploy na Vercel (Frontend + API Serverless)

O projeto possui roteamento configurado em `vercel.json` para servir o SPA React a partir de `dist/` e encaminhar todas as requisições `/api/*` para a Serverless Function `api/index.ts` (que compartilha as mesmas rotas de `server/app.ts`).

1. Envie o repositório atualizado para o GitHub/GitLab.
2. No painel da **Vercel** (`Project Settings -> Environment Variables`), configure:
   - `ADMIN_EMAIL` = `duduvlnt040@gmail.com`
   - `APP_URL` = `https://minha-live-game-app.vercel.app`
   - `SESSION_SECRET` = chave aleatória longa (ex.: `openssl rand -hex 32`)
3. **Persistência de contas e jogos em produção (recomendado — plano gratuito)**:
   - No painel do projeto na Vercel, abra a aba **Storage** e conecte um banco **Upstash Redis** (ou **Vercel KV**).
   - Isso cria automaticamente `KV_REST_API_URL` e `KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`), garantindo que contas, senhas, jogos publicados e regras persistam entre reinicializações e múltiplas instâncias serverless.
   - *(Opcional)* Para envio real de e-mails de recuperação de senha, adicione `RESEND_API_KEY` e `EMAIL_FROM`.
4. Comando de build: `npm run build` · Diretório de saída: `dist`.

