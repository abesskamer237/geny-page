# Geny · Boutique Client & Portail Revendeur

Application complète prête à déployer sur un VPS Linux (Ubuntu / Debian) :
- **Boutique client (`/`)** : Catalogue des forfaits Geny, achat d'un nouveau code ou recharge d'un code existant (`topup_code`), paiement Mobile Money **Mode Direct** (MTN MoMo & Orange Money), vérification de code (`POST /codes/lookup`), historique client **Mes codes** et téléchargements Android / Windows / PDF.
- **Portail revendeur (`/revendeur`)** et **Espace API (`/espace-api#/overview`)**.
- **Proxy serveur Express (`server.ts`)** : protège votre clé API secrète (`GENY_API_KEY`) côté serveur et reçoit les notifications webhook signées (`/api/webhooks/geny`).

---

## Déploiement automatique via GitHub Actions (Recommandé)

Le workflow `.github/workflows/deploy.yml` compile l’application sur GitHub (`tsc --noEmit`, `vite build`, test serveur Node 22), transfère le build sur votre VPS via SSH, configure `systemd`, **Nginx** et le certificat SSL **HTTPS (Certbot)** pour votre domaine.

Ajoutez ces **Secrets** dans votre dépôt GitHub (**Settings → Secrets and variables → Actions → Secrets**) :

| Nom | Obligatoire | Valeur |
|---|---|---|
| `VPS_HOST` | Oui | Adresse IP publique de votre VPS |
| `VPS_USER` | Oui | Utilisateur SSH (`root`, `ubuntu`, `debian`…) |
| `VPS_PASSWORD` | Oui | Mot de passe SSH de l’utilisateur |
| `GENY_API_KEY` | Oui (prod) | Votre clé API `gk_live_...` ou `gk_test_...` |
| `GENY_WEBHOOK_SECRET` | Optionnel | Secret `whsec_...` depuis l’onglet Webhook Geny |

Et dans **Variables** (ou **Secrets**, les deux sont acceptés) :

| Nom | Défaut | Valeur |
|---|---|---|
| `VPS_DOMAIN` | *(aucun)* | Domaine principal (ex: `boutique.mondomaine.com`) |
| `VPS_DOMAINS` | *(aucun)* | Liste de domaines supplémentaires séparés par des virgules (ex: `alice.cm,marc.cm`) |
| `VPS_PORT` | `22` | Port SSH du VPS |
| `APP_PORT` | `3000` | Port interne Node.js |
| `CERTBOT_EMAIL` | *(optionnel)* | E-mail pour le certificat SSL Let’s Encrypt |

Dès que vous faites `git push` sur `main` (ou `master`), ou via **Actions → Build & Deploy Geny to VPS → Run workflow**, le site est mis en ligne automatiquement.

---

## Héberger plusieurs boutiques revendeurs (multi-domaines) sur un seul VPS

Une seule instance `geny-shop` sur votre VPS peut servir **autant de boutiques et de noms de domaine que vous le souhaitez**, chacun connecté à **sa propre clé API Geny** :

1. **Pointez le DNS** (`Enregistrement A`) de chaque domaine (ex: `alice-wifi.cm`, `marc-net.cm`) vers l'IP publique de votre VPS.
2. **Ajoutez le revendeur dans l'interface** : ouvrez `/espace-api#/tenants` (**Boutiques & Domaines**), renseignez le nom de domaine, le nom commercial, la clé `gk_live_...` du revendeur (et son secret webhook optionnel), puis cliquez sur **Tester la clé**.
3. **Activez Nginx + SSL HTTPS en 1 commande sur le VPS** :
   ```bash
   sudo bash /opt/geny-shop/scripts/add-domain.sh alice-wifi.cm
   ```
   *(Ou configurez tout en 1 ligne sans passer par l'interface : `sudo bash /opt/geny-shop/scripts/add-domain.sh alice-wifi.cm "Alice WiFi" "gk_live_..." "whsec_..."`)*

Chaque domaine possède alors automatiquement :
- Son propre nom de boutique affiché, ses propres tarifs Geny et son propre historique client.
- Sa propre clé API Geny isolée côté serveur.
- Son propre webhook dédié : `https://alice-wifi.cm/api/webhooks/geny`.

---

## Installation manuelle sur un VPS en une commande

Envoyez le fichier `geny-shop-vps.zip` sur votre VPS (ou téléchargez-le dans `/opt`), puis exécutez :

```bash
unzip geny-shop-vps.zip -d geny-shop && cd geny-shop && sudo GENY_API_KEY="gk_live_VOTRE_CLE_API" bash install.sh
```

> Si vous lancez simplement `sudo bash install.sh` sans passer `GENY_API_KEY`, le script vous demandera votre clé API de manière interactive.

Ce que fait `install.sh` automatiquement :
1. Installe **Node.js 22 LTS** si absent.
2. Crée le fichier `.env` sécurisé (`chmod 600 .env`).
3. Installe les dépendances (`npm install`) et compile l'interface (`npm run build`).
4. Crée et démarre le service systemd `geny-shop` (redémarrage automatique 24/7).

---

## Comment connecter réellement cette page à votre compte Geny

1. **Récupérer votre clé API revendeur**
   - Connectez-vous sur `https://geny.payool.net/` puis ouvrez `https://geny.payool.net/espace-api#/keys`.
   - Créez une clé **Test** (`gk_test_...`) pour vos essais, ou une clé **Production** (`gk_live_...`) pour encaisser de vrais paiements MTN MoMo / Orange Money.

2. **Configurer `.env` sur le VPS**
   ```env
   NODE_ENV=production
   PORT=3000
   GENY_API_KEY=gk_live_votre_cle_secrete
   GENY_API_BASE_URL=https://geny.payool.net/api/v1/partner
   GENY_WEBHOOK_SECRET=whsec_votre_secret_webhook
   ```
   Puis redémarrez le service :
   ```bash
   sudo systemctl restart geny-shop
   ```

3. **Vérifier la connexion en direct**
   - Sur la page d'accueil `/`, le badge en haut de la section d'accueil affichera : **« Connecté en direct à l’API Geny »**.
   - Les forfaits et tarifs affichés proviennent directement de `GET https://geny.payool.net/api/v1/partner/plans` (avec les prix de revente personnalisés dans votre Espace API).
   - Chaque commande passée par un client appelle `POST /api/v1/partner/orders` en `mode: "direct"` avec une référence `order_ref` idempotente, déclenche le paiement Mobile Money réel sur le téléphone du client, et délivre le vrai code `GENY-...` dès validation.

4. **Configurer le Webhook (recommandé en production)**
   - Dans `https://geny.payool.net/espace-api#/webhook`, renseignez votre URL publique :
     `https://votre-domaine.com/api/webhooks/geny`
   - Copiez le secret `whsec_...` généré dans `GENY_WEBHOOK_SECRET` de votre `.env`.

5. **Mettre un nom de domaine en HTTPS (Nginx + Certbot)**
   ```nginx
   server {
       server_name boutique.votre-domaine.com;
       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
   Puis activez SSL : `sudo certbot --nginx -d boutique.votre-domaine.com`.
