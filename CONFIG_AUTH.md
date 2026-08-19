# Configuration de l'authentification — IDEAFORMA

Procédure à faire une seule fois. Le code de récupération de mot de passe est en place ;
sans ces réglages, les liens envoyés par e-mail ne fonctionnent pas.

---

## 1 · URL Configuration — le réglage manquant

**Supabase → Authentication → URL Configuration**

C'est ce qui bloquait la récupération de mot de passe. Supabase refuse de rediriger
vers une adresse qui n'est pas explicitement autorisée : le lien du mail retombait
donc sur la Site URL par défaut au lieu de `reset-password.html`.

**Site URL**

```
https://ton-domaine.vercel.app
```

**Redirect URLs** — ajouter chaque ligne séparément :

```
https://ton-domaine.vercel.app/index.html
https://ton-domaine.vercel.app/reset-password.html
https://ton-domaine.vercel.app/app.html
http://localhost:3000/index.html
http://localhost:3000/reset-password.html
```

Les deux dernières servent au développement local. Adapte le port si tu n'utilises
pas 3000. Les jokers sont acceptés (`https://ton-domaine.vercel.app/**`) si tu
préfères une seule ligne, mais lister les pages est plus sûr.

---

## 2 · Serveur SMTP — pour que le mail arrive vraiment

**Supabase → Authentication → Emails → SMTP Settings**

Le service d'envoi intégré de Supabase est limité à quelques messages par heure et
n'est pas destiné à la production. Choix retenu : **Resend**.

### Valeurs à saisir dans Supabase

| Champ | Valeur |
|---|---|
| Enable Custom SMTP | activé |
| Host | `smtp.resend.com` |
| Port | `465` (implicite TLS — `587` fonctionne aussi en STARTTLS) |
| Username | `resend` — littéralement ce mot, pas une adresse |
| Password | la clé API Resend (`re_...`) |
| Sender name | `IDEAFORMA` |
| Sender email | voir « Adresse d'expédition » ci-dessous |
| Minimum interval between emails | `60` secondes |

Le champ *Username* est contre-intuitif : Resend attend la chaîne `resend`, et le
mot de passe est la clé API. Une clé n'est affichée qu'une fois à sa création ;
si elle est perdue, en générer une nouvelle dans **Resend → API Keys**.

### Adresse d'expédition — la contrainte à connaître

Resend n'autorise l'envoi que depuis un domaine vérifié. Sans domaine, la seule
adresse disponible est `onboarding@resend.dev`, et elle **ne peut écrire qu'à
l'adresse du titulaire du compte Resend** (ici `contact.ideaforma@gmail.com`).
Tout autre destinataire est rejeté avec une erreur 403 :

> You can only send testing emails to your own email address. To send emails to
> other recipients, please verify a domain at resend.com/domains.

`gmail.com` ne peut pas être vérifié — le domaine doit t'appartenir.

**Usage mono-utilisateur** — `onboarding@resend.dev` en expéditeur suffit :
tu reçois tes propres liens de réinitialisation, rien d'autre n'est nécessaire.

**Dès qu'un deuxième compte existe** (collègue, formateur) — il faut un domaine :

1. **Resend → Domains → Add Domain**, saisir le domaine.
2. Ajouter chez le registrar les enregistrements affichés : un `MX` et deux `TXT`
   (SPF et DKIM). Compter de dix minutes à quelques heures de propagation.
3. Une fois le domaine au vert, mettre `contact@ton-domaine.fr` en *Sender email*
   dans Supabase.

Sans cette étape, un nouvel utilisateur ne recevra jamais son mail de confirmation
et l'échec sera silencieux côté application — visible uniquement dans les Auth Logs.

### Quotas

Le palier gratuit Resend couvre largement l'usage : 3 000 e-mails par mois,
100 par jour. Une réinitialisation de mot de passe en consomme un.

---

## 3 · Gabarit du mail — en français

**Supabase → Authentication → Email Templates → Reset Password**

Le modèle par défaut est en anglais. À remplacer :

**Subject**

```
IDEAFORMA — Réinitialisation de votre mot de passe
```

**Message body**

```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            max-width:520px;margin:0 auto;padding:28px;background:#fff;
            border-radius:12px;border:1px solid #E2E8F0;">

  <div style="font-size:18px;font-weight:700;color:#1E2D4B;margin-bottom:14px;">
    Réinitialisation de votre mot de passe
  </div>

  <p style="font-size:14px;color:#475569;line-height:1.6;">
    Vous avez demandé à réinitialiser le mot de passe de votre compte IDEAFORMA.
    Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
  </p>

  <div style="text-align:center;margin:26px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="display:inline-block;background:#1E2D4B;color:#fff;text-decoration:none;
              padding:12px 26px;border-radius:8px;font-size:14px;font-weight:600;">
      Choisir un nouveau mot de passe
    </a>
  </div>

  <p style="font-size:12.5px;color:#64748B;line-height:1.6;">
    Ce lien est valable <strong>1 heure</strong> et ne peut être utilisé qu'une seule fois.<br>
    Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de
    passe reste inchangé.
  </p>

  <div style="margin-top:22px;padding-top:16px;border-top:1px solid #E2E8F0;
              font-size:11px;color:#94A3B8;text-align:center;">
    IDEAFORMA — Organisme de formation certifié Qualiopi
  </div>
</div>
```

Le même traitement peut être appliqué au modèle **Confirm signup**.

---

## 4 · Durée de validité du lien

**Supabase → Authentication → Providers → Email**

`Email OTP Expiration` : `3600` secondes (1 heure). C'est la valeur annoncée dans
le mail et dans les messages d'erreur de l'application — garde les deux cohérents.

---

## 5 · Tester

1. Ouvre la page de connexion en **navigation privée**.
2. *Mot de passe oublié ?* → saisis ton adresse → *Envoyer le lien*.
3. Le mail doit arriver en moins d'une minute. S'il n'arrive pas :
   **Supabase → Logs → Auth Logs** indique si l'envoi a été tenté et le retour SMTP. Côté Resend, **Emails** liste chaque message avec son statut (delivered, bounced, ou l'erreur 403 si le destinataire n'est pas autorisé).
4. Clique sur le lien : tu dois atterrir sur `reset-password.html` avec le formulaire,
   pas sur l'écran « Lien invalide ».
5. Choisis un nouveau mot de passe, puis reconnecte-toi avec.

### Si l'écran « Lien invalide » s'affiche

La page distingue maintenant les causes, le message te dira laquelle :

| Message affiché | Cause | Correction |
|---|---|---|
| Lien expiré | Plus d'une heure écoulée | Redemander un lien |
| Lien déjà utilisé | Un lien ne sert qu'une fois — attention, certains antivirus et scanners de messagerie « cliquent » les liens avant toi et les consomment | Redemander un lien ; si le problème est systématique, la cause est le scanner du fournisseur de messagerie |
| Lien ouvert dans un autre navigateur | Flux PKCE : la demande et l'ouverture doivent se faire dans le même navigateur | Refaire la demande depuis le navigateur où tu ouvres le mail |
| Lien invalide ou expiré | Redirect URL non autorisée | Reprendre l'étape 1 |

---

## 6 · Changer son mot de passe sans passer par l'oubli

Une fois connecté : **Paramètres → Sécurité**. Le mot de passe actuel est demandé
avant toute modification — Supabase ne l'exige pas de lui-même, l'application le
vérifie explicitement pour qu'une session laissée ouverte sur un poste partagé ne
suffise pas à changer le mot de passe.
