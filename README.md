# Site Osiris — notes pour le dev (Vercel)

Site du serveur GTA RP Osiris : œil d'Horus animé, compte à rebours du Programme 01, jeu de piste (terminal « Accès candidat ») et casting. Pour candidater, le joueur se connecte avec Discord ; sa candidature ouvre un ticket privé sur le serveur Osiris.

## Fichiers

- `index.html` : toute la page (HTML, CSS et JS dans un seul fichier).
- `lib/discord.js` : sessions signées (cookie HttpOnly), cookies, appels à l'API Discord.
- `api/auth/login.js` : redirige vers Discord (scopes `identify guilds.join`).
- `api/auth/callback.js` : récupère le compte, ajoute le joueur au serveur Osiris, ouvre la session (6 h).
- `api/auth/logout.js` : ferme la session.
- `api/me.js` : dit à la page si le joueur est connecté.
- `api/candidature.js` : `GET` = diagnostic des variables ; `POST` = crée le ticket.
- `api/interactions.js` : tickets d'aide (bouton, menu des catégories, fenêtre, salon privé, fermeture).
- `api/panel.js` : publie le message « Créer un ticket » dans le salon d'aide.
- `lib/aide.js` : la liste des catégories d'aide et le texte du panneau (à modifier ici).
- `package.json` : `"type": "module"`.

## Parcours du candidat

1. Il clique sur « Se connecter avec Discord » et accepte.
2. Il revient sur le site, connecté, et il est ajouté au serveur Osiris s'il n'y était pas.
3. Il remplit le dossier et le soumet.
4. Un salon `candidature-<numéro>-<pseudo>` est créé dans la catégorie des tickets, visible seulement par lui, le staff et le bot. Le dossier y est posté, avec une mention du candidat et du rôle staff.
5. Il reçoit le rôle « Postulant » si la variable `DISCORD_POSTULANT_ROLE_ID` est configurée. Le bot doit avoir la permission « Gérer les rôles », et son rôle doit être placé au-dessus de Postulant.
6. Un seul ticket par candidat : s'il en a déjà un, le site lui donne le lien vers celui-ci.

## Préparer Discord

1. Sur https://discord.com/developers/applications : **New Application** (« Osiris »).
2. Onglet **OAuth2** : copier le **Client ID** et le **Client Secret** ; ajouter la redirection `https://<ton-domaine>/api/auth/callback` (exactement l'adresse du site).
3. Onglet **Bot** : créer le bot, copier son **token**.
4. Inviter le bot sur le serveur Osiris avec les permissions : Voir les salons, Gérer les salons, Envoyer des messages, Intégrer des liens, Voir l'historique, Créer une invitation (nécessaire pour ajouter les candidats au serveur).
5. Sur le serveur : créer une catégorie « Candidatures » et un rôle « Staff ». Activer le mode développeur de Discord, puis clic droit → Copier l'identifiant sur le serveur, la catégorie et le rôle.
6. Le rôle du bot doit être placé au-dessus du rôle des candidats dans la liste des rôles.

## Variables d'environnement (Vercel → Settings → Environment Variables)

| Variable | Valeur |
| --- | --- |
| `DISCORD_CLIENT_ID` | Client ID de l'application |
| `DISCORD_CLIENT_SECRET` | Client Secret de l'application |
| `DISCORD_BOT_TOKEN` | Token du bot |
| `DISCORD_GUILD_ID` | Identifiant du serveur Osiris |
| `DISCORD_TICKET_CATEGORY_ID` | Identifiant de la catégorie des tickets |
| `DISCORD_STAFF_ROLE_ID` | Identifiant du rôle staff |
| `SESSION_SECRET` | Une longue phrase aléatoire (32 caractères ou plus) |
| `SITE_URL` | Adresse du site sans `/` final, ex. `https://osiris-rp.vercel.app` |
| `DISCORD_PUBLIC_KEY` | Public Key de l'application (onglet General Information), pour les tickets d'aide |
| `DISCORD_ADMIN_ROLE_ID` | Identifiant du rôle Admin : seuls les admins voient les tickets « Problème avec le staff » |
| `DISCORD_HELP_CATEGORY_ID` | Facultatif. Catégorie Discord des tickets d'aide (sinon, celle des candidatures) |
| `SETUP_KEY` | Un mot de passe de ton choix, pour publier le panneau d'aide |
| `DISCORD_POSTULANT_ROLE_ID` | Facultatif. Identifiant du rôle « Postulant », donné automatiquement à chaque candidat qui envoie un dossier |

Redéployer après chaque modification des variables. Vérification : ouvrir `https://<ton-domaine>/api/candidature` → doit afficher « toutes les variables sont configurées ».

L'ancienne variable `DISCORD_WEBHOOK` n'est plus utilisée.

## Tickets d'aide

1. Ajouter les variables `DISCORD_PUBLIC_KEY`, `DISCORD_ADMIN_ROLE_ID`, `SETUP_KEY` (et si besoin `DISCORD_HELP_CATEGORY_ID`), puis redéployer.
2. Sur https://discord.com/developers/applications → l'application → **General Information** → **Interactions Endpoint URL** : `https://<ton-domaine>/api/interactions` → Save. Discord vérifie l'adresse tout de suite.
3. Ouvrir une fois `https://<ton-domaine>/api/panel?key=<SETUP_KEY>&channel=<identifiant du salon d'aide>` : le message « Créer un ticket » apparaît dans le salon.
4. Parcours : bouton « Créer un ticket » → menu des catégories → fenêtre « Explique ton problème » → salon privé avec le staff. Les tickets « Problème avec le staff » ne sont visibles que par le rôle Admin. Un seul ticket ouvert par personne et par catégorie. Le bouton « Fermer le ticket » supprime le salon (staff ou auteur).
5. Diagnostic : `https://<ton-domaine>/api/interactions`.

## Sécurité

- Aucun secret n'est envoyé au navigateur : le token du bot et le client secret restent côté serveur.
- La session est un cookie HttpOnly, signé (HMAC SHA-256), valable 6 heures.
- La connexion Discord est protégée par un paramètre `state` (anti-CSRF).
- Les champs sont nettoyés et tronqués ; les mentions sont limitées au candidat et au rôle staff.
- Champ piège anti-robots (`site`), ignoré s'il est rempli.
- Les tickets d'aide vérifient la signature Discord de chaque requête (clé publique Ed25519).

## Jeu de piste (réservé au staff)

Réponses, dans l'ordre : `0333`, `CANDIDAT17`, `LUDENDORFF`. Code final : `THOT-17-A3`.

## Offre Vercel

L'offre gratuite (Hobby) est réservée à un usage non commercial. Les dons ne comptent pas comme usage commercial.
