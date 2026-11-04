# Templates d'e-mails Supabase Auth — Soline

À coller dans **Supabase → Authentication → Emails → Templates** (un onglet par cas).
Copier tout le contenu du fichier `.html` dans le champ « Message body », et l'objet ci-dessous dans « Subject ».

| Template Supabase | Fichier | Objet (Subject) |
|---|---|---|
| Confirm sign up | `confirm-signup.html` | `Confirmez votre adresse e-mail · Soline` |
| Invite user | `invite-user.html` | `Vous êtes invité à rejoindre Soline` |
| Magic link or OTP | `magic-link.html` | `Votre lien de connexion Soline` |
| Change email address | `change-email.html` | `Confirmez votre nouvelle adresse e-mail · Soline` |
| Reset password | `reset-password.html` | `Réinitialisez votre mot de passe Soline` |
| Reauthentication | `reauthentication.html` | `Votre code de vérification Soline : {{ .Token }}` |

## Variables utilisées

- `{{ .ConfirmationURL }}` : lien d'action (confirmation, invitation, connexion, changement d'adresse, réinitialisation).
- `{{ .Token }}` : code à 6 chiffres (Magic link / OTP, Reauthentication).
- `{{ .TokenHash }}` + `{{ .SiteURL }}` : lien direct de réinitialisation (voir plus bas).
- `{{ .Email }}` : adresse du compte. `{{ .NewEmail }}` : nouvelle adresse (Change email).

## À savoir

- HTML « compatible messageries » : tableaux, styles en ligne, pas de police web ni d'image externe
  (le logo est dessiné en HTML, il s'affiche même si les images sont bloquées).
- Le lien de « Confirm sign up » renvoie vers `/auth/callback` : si la session ne peut pas s'ouvrir
  (mail ouvert sur un autre appareil), l'utilisateur arrive sur `/login` avec son e-mail prérempli.
- « Reset password » : le lien pointe vers `{{ .SiteURL }}/auth/confirm?token_hash=…&type=recovery`
  au lieu de `{{ .ConfirmationURL }}`. Il ouvre la session sur **n'importe quel appareil** (demande faite
  sur PC, mail ouvert sur le téléphone) puis mène à `/login/nouveau-mot-de-passe`.
  Pré-requis : *Authentication → URL Configuration → Site URL* = `https://app.solinebtp.fr`
  (ou `https://solinebtp.fr`, qui redirige vers l'app), **sans `/` final**.
