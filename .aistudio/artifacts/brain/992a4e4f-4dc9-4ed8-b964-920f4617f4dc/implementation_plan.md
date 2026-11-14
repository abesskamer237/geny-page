# Samari · Boutique Geny Connectée à l’API Partenaire

Créer une vitrine de vente publique et un tunnel de commande Mobile Money construits exactement selon les spécifications de l’onglet **Intégration** de `https://geny.payool.net/espace-api`, reliés côté serveur à l’API partenaire officielle de Geny.

## User Review & Critical Decisions

> [!IMPORTANT]
> Décisions clés issues des instructions de l’onglet **Intégration** de Geny :
> - **Sécurité de la clé API** : Conformément aux règles de Geny (*« la clé dans une variable d’environnement — sur le serveur, jamais dans le code »*), la clé `GENY_API_KEY` (`gk_live_...` ou `gk_test_...`) est lue exclusivement côté serveur Express via les variables d'environnement, jamais exposée dans le navigateur ni saisie dans un formulaire public.
> - **Modes pris en charge** : Tunnel de paiement **Mode Direct** (MTN MoMo & Orange Money avec gestion USSD, OTP SMS et idempotence `order_ref`), **Recharge d'un code existant** (`topup_code` vérifié via `POST /codes/lookup`), et suivi temps réel via `GET /orders/{order_ref}` et webhook HMAC `Geny-Signature`.
> - **Double fonctionnement Live / Bac à sable** : Dès que `GENY_API_KEY` est configurée dans les Secrets de l'application, le serveur dialogue en direct avec `https://geny.payool.net/api/v1/partner`. En l'absence de clé, le catalogue réel reste synchronisé et les commandes s'exécutent en mode démonstration local fidèle au protocole officiel.

## 1. Overview & Core Concept

- **What It Does**: Une boutique en ligne dédiée aux clients finaux pour acheter ou recharger un forfait Internet Geny en quelques secondes, avec détection automatique de l'opérateur Mobile Money camerounais, validation OTP SMS, vérification de code existant et récupération immédiate du code d'activation `GENY-XXXX-XXXX-XXXX`.
- **Target Audience / Persona**: Les clients du revendeur **Samari** qui souhaitent acheter un pass Internet Geny (Android ou Windows) directement depuis un site web connecté au compte revendeur.
- **Key Value**: Automatise intégralement la vente de codes sans intervention manuelle, en respectant l'idempotence (`order_ref`), les limites tarifaires fixées dans Geny et la sécurité de la clé API côté serveur.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Catalogue & Sélection de Forfait** : Le client parcourt les forfaits Geny synchronisés (filtrables par durée ou illimité), compare quota et durée, ou bascule sur l'onglet **Recharger un code** pour prolonger un code existant (`POST /codes/lookup`).
  2. **Paiement Mobile Money (Mode Direct)** : Le client saisit son numéro `+237` (détection automatique des préfixes MTN MoMo / Orange Money), confirme le prix client affiché et valide. Le serveur génère un `order_ref` unique et enregistre la commande avant l'appel API.
  3. **Validation USSD / OTP & Livraison du Code** : La page interroge régulièrement l'état de la commande (`GET /orders/{order_ref}`), affiche le champ de code SMS (`POST /orders/{order_ref}/otp`) si `payment.requires_otp` est actif, puis affiche le code `GENY-...` prêt à copier et sauvegardé dans l'historique local du client (`Mes codes`).
  4. **Vérification de Code & Téléchargement App** : Le client peut vérifier la validité/solde d'un code existant et télécharger l'application Android/Windows ou le guide d'utilisation PDF.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Vitrine e-commerce claire, structurée et rassurante, fidèle à l'identité Geny (violet `#7544DD` / `#6733CF`, surface lavande `#F6F5FB`, mode sombre `#100E19`, accent serif rouge `#D92D20` sur *« Sans BullShit. »*).
  - *Typography & Hierarchy*: Titres nets en `Plus Jakarta Sans`, corps lisible en `DM Sans`, codes d'activation, références `order_ref` et montants FCFA en `JetBrains Mono` / chiffres tabulaires (`tabular-nums`).
  - *Navigation*: Barre supérieure épurée à 3 zones (Marque Samari · Geny, 4 liens simples *Forfaits / Recharger / Vérifier un code / Télécharger*, et action *Mes codes* + bascule thème/langue), avec accès discret au portail revendeur déjà en place.
- **Interactive Feedback & Motion**: Micro-animations rapides ($\le 200\text{ ms}$), états de chargement squelettes pour le catalogue, messages d'erreur explicites selon les codes d'erreur Geny (`402`, `409`, `422`, `429`), et bouton de simulation de résultat lorsque l'API tourne en mode Test.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Proxy API Partenaire côté serveur Express**
  - *Chosen Approach*: Tous les appels vers `https://geny.payool.net/api/v1/partner` transitent par des routes `/api/shop/*` sur le serveur Express avec injection de `GENY_API_KEY` côté serveur.
  - *Why*: Protège la clé secrète revendeur, applique la politique d'idempotence (`order_ref` sauvegardé avant l'envoi) et gère la vérification HMAC-SHA256 sur le endpoint webhook `/api/webhooks/geny`.
  - *Alternatives Considered*: Appels directs depuis le navigateur (impossible sans exposer la clé API secrète et bloqué par CORS).
- **Decision 2: Support natif de l'achat neuf et de la recharge (`topup_code`)**
  - *Chosen Approach*: Permettre soit de générer un nouveau code, soit de saisir un code existant vérifié au préalable via `POST /codes/lookup` avant création de la commande.
  - *Why*: Exploite pleinement les capacités documentées dans l'onglet Intégration de Geny tout en évitant les rejets `422 topup_refused` au moment du paiement.
- **Decision 3: Conservation du Portail Revendeur & Espace API existants**
  - *Chosen Approach*: Déployer la nouvelle boutique connectée sur la page principale (`/`) tout en conservant le portail revendeur et l'Espace API accessibles via `/revendeur` et `/espace-api`.
  - *Why*: Permet de tester aussi bien l'expérience client rattachée à l'API que la gestion revendeur.

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────┐
│                  Boutique Client (Navigateur)                  │
│  Catalogue · Achat / Recharge · Tunnel Mobile Money · Mes Codes│
└───────────────────────────────┬────────────────────────────────┘
                                │ HTTP (/api/shop/*)
                                ▼
┌────────────────────────────────────────────────────────────────┐
│                  Serveur Proxy Express (Port 3000)             │
│  ┌──────────────────────────┐  ┌────────────────────────────┐  │
│  │ Gestionnaire Idempotence │  │ Récepteur Webhook          │  │
│  │ (order_ref & suivi état) │  │ POST /api/webhooks/geny    │  │
│  └────────────┬─────────────┘  │ (Vérif. Geny-Signature)    │  │
│               │                └────────────────────────────┘  │
│               ▼                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Client API Geny (Authorization: Bearer GENY_API_KEY)     │  │
│  │ Live: https://geny.payool.net/api/v1/partner             │  │
│  │ Fallback: Simulateur fidèle au contrat si clé absente    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**: Chaque commande génère et persiste localement son `order_ref` unique (`CMD-...`), le `plan_id`, le numéro Mobile Money, l'opérateur, le `topup_code` éventuel, l'état (`pending`, `succeeded`, `failed`, `expired`) et le code reçu, afin de garantir l'idempotence et la reprise après rafraîchissement.
- **Key Sequences**:
  1. `GET /api/shop/catalog` → lit `GET /plans` et `GET /account` (ou endpoints publics Geny) pour afficher les tarifs client à jour.
  2. `POST /api/shop/codes/lookup` → vérifie la validité d'un code avant recharge.
  3. `POST /api/shop/orders` → enregistre `order_ref`, appelle `POST /orders` (`mode: "direct"`), renvoie `payment.requires_otp` / `otp_instruction`.
  4. `GET /api/shop/orders/:order_ref` & `POST /api/shop/orders/:order_ref/otp` → suit la confirmation opérateur ou soumet le code SMS, et affiche le code final `GENY-...`.
  5. `POST /api/shop/orders/:order_ref/simulate` → permet de simuler un succès/échec en mode `gk_test_...` via `POST /test/orders/{order_ref}/simulate`.
