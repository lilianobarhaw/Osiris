// Osiris : tickets d'aide.
// Discord envoie ici les clics sur les boutons et les menus (Interactions Endpoint URL de l'application).
//   1. « Créer un ticket »  → menu des catégories (visible seulement par la personne)
//   2. Choix d'une catégorie → petite fenêtre « Explique ton problème »
//   3. Envoi                 → salon privé créé, staff (ou admins) mentionnés
//   4. « Fermer le ticket »  → salon supprimé (staff ou auteur du ticket)

import { createPublicKey, verify } from "node:crypto";
import { env, json, bot } from "../lib/discord.js";
import { CATEGORIES } from "../lib/aide.js";

const VIEW = 1024n, SEND = 2048n, EMBED = 16384n, ATTACH = 32768n, HISTORY = 65536n;
const bits = (...p) => p.reduce((a, b) => a | b, 0n).toString();
const EPHEMERAL = 64;
const COLOR = 0xc4a265;

function slug(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "membre";
}

function checkSignature(body, signature, timestamp) {
  try {
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(env("DISCORD_PUBLIC_KEY"), "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

const reply = (content, extra = {}) => json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });
const update = (content) => json({ type: 7, data: { content, components: [], embeds: [] } });

export async function POST(req) {
  const body = await req.text();
  const ok = checkSignature(body, req.headers.get("x-signature-ed25519") || "", req.headers.get("x-signature-timestamp") || "");
  if (!ok) return new Response("Signature invalide", { status: 401 });

  const i = JSON.parse(body);
  if (i.type === 1) return json({ type: 1 }); // PING de vérification de Discord

  const user = i.member?.user || i.user;
  const roles = i.member?.roles || [];
  const id = i.data?.custom_id || "";

  try {
    // 1. Bouton « Créer un ticket » → menu des catégories
    if (i.type === 3 && id === "aide_ouvrir") {
      return reply("**Quel est le sujet de ton ticket ?**", {
        components: [{
          type: 1,
          components: [{
            type: 3,
            custom_id: "aide_categorie",
            placeholder: "Choisis une catégorie",
            options: CATEGORIES.map((c) => ({ label: c.label, value: c.key, description: c.description.slice(0, 100), emoji: { name: c.emoji } })),
          }],
        }],
      });
    }

    // 2. Catégorie choisie → fenêtre pour décrire le problème
    if (i.type === 3 && id === "aide_categorie") {
      const cat = CATEGORIES.find((c) => c.key === i.data.values?.[0]);
      if (!cat) return reply("Catégorie inconnue.");
      return json({
        type: 9,
        data: {
          custom_id: "aide_envoi:" + cat.key,
          title: cat.label.slice(0, 45),
          components: [{
            type: 1,
            components: [{
              type: 4,
              custom_id: "texte",
              label: "Explique ton problème",
              style: 2,
              min_length: 10,
              max_length: 1500,
              required: true,
              placeholder: "Ce qui se passe, quand, avec qui…",
            }],
          }],
        },
      });
    }

    // 3. Fenêtre envoyée → création du salon privé
    if (i.type === 5 && id.startsWith("aide_envoi:")) {
      const cat = CATEGORIES.find((c) => c.key === id.split(":")[1]);
      if (!cat) return reply("Catégorie inconnue.");
      const texte = i.data.components?.[0]?.components?.[0]?.value || "—";
      const guild = i.guild_id;
      const parent = (process.env.DISCORD_HELP_CATEGORY_ID || process.env.DISCORD_TICKET_CATEGORY_ID || "").trim();
      const staff = env("DISCORD_STAFF_ROLE_ID");
      const admin = (process.env.DISCORD_ADMIN_ROLE_ID || "").trim();
      const equipe = cat.admin && admin ? admin : staff;
      const botId = env("DISCORD_CLIENT_ID");
      const marque = `[aide:${cat.key}] ${user.id}`;

      // Un seul ticket ouvert par personne et par catégorie.
      const list = await bot(`/guilds/${guild}/channels`);
      if (list.ok) {
        const deja = (await list.json()).find((c) => (c.topic || "").includes(marque));
        if (deja) return reply(`Tu as déjà un ticket ouvert dans cette catégorie : <#${deja.id}>`);
      }

      const make = (extra) => bot(`/guilds/${guild}/channels`, {
        method: "POST",
        body: JSON.stringify({
          name: `${cat.key}-${slug(user.username)}`,
          type: 0,
          ...(parent ? { parent_id: parent } : {}),
          topic: `${cat.emoji} ${cat.label} · ticket de @${user.username} · ${marque}`,
          permission_overwrites: [
            { id: guild, type: 0, deny: bits(VIEW) },
            { id: user.id, type: 1, allow: bits(VIEW, SEND, HISTORY, ...extra) },
            { id: equipe, type: 0, allow: bits(VIEW, SEND, HISTORY, ...extra) },
            ...(equipe !== admin && admin ? [{ id: admin, type: 0, allow: bits(VIEW, SEND, HISTORY, ...extra) }] : []),
            { id: botId, type: 1, allow: bits(VIEW, SEND, HISTORY, EMBED, ...extra) },
          ],
        }),
      });

      // Avec l'envoi de captures d'écran ; sans, si le bot n'a pas « Joindre des fichiers ».
      let res = await make([ATTACH]);
      if (res.status === 403) res = await make([]);
      if (!res.ok) {
        let why = "";
        try { why = (await res.json()).message || ""; } catch {}
        return reply(`Impossible d'ouvrir le ticket (code ${res.status}${why ? " : " + why : ""}). Préviens un membre du staff.`);
      }
      const channel = await res.json();

      await bot(`/channels/${channel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: `<@${user.id}>, ton ticket est ouvert. <@&${equipe}>`,
          allowed_mentions: { users: [user.id], roles: [equipe] },
          embeds: [{
            title: `${cat.emoji} ${cat.label}`,
            description: texte.slice(0, 4000),
            color: COLOR,
            footer: { text: cat.admin ? "Osiris · ticket visible uniquement par la direction" : "Osiris · le staff te répond ici" },
            timestamp: new Date().toISOString(),
          }],
          components: [{ type: 1, components: [{ type: 2, style: 4, label: "Fermer le ticket", emoji: { name: "🔒" }, custom_id: "aide_fermer" }] }],
        }),
      });

      return reply(`Ton ticket est ouvert : <#${channel.id}>`);
    }

    // 4. Fermeture du ticket
    if (i.type === 3 && id === "aide_fermer") {
      const chRes = await bot(`/channels/${i.channel_id}`);
      const topic = chRes.ok ? (await chRes.json()).topic || "" : "";
      const auteur = topic.includes(user.id);
      const staff = env("DISCORD_STAFF_ROLE_ID");
      const admin = (process.env.DISCORD_ADMIN_ROLE_ID || "").trim();
      if (!auteur && !roles.includes(staff) && !(admin && roles.includes(admin))) {
        return reply("Seuls le staff et l'auteur du ticket peuvent le fermer.");
      }
      if (!topic.includes("[aide:")) return reply("Ce salon n'est pas un ticket d'aide.");
      await bot(`/channels/${i.channel_id}`, { method: "DELETE", headers: { "X-Audit-Log-Reason": `Ticket fermé par @${user.username}` } });
      return update("Ticket fermé.");
    }

    return reply("Action inconnue.");
  } catch (e) {
    return reply("Erreur : " + (e?.message || "inconnue"));
  }
}

// Diagnostic : ouvrir /api/interactions dans le navigateur.
export function GET() {
  const need = ["DISCORD_PUBLIC_KEY", "DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_STAFF_ROLE_ID", "SETUP_KEY"];
  const missing = need.filter((k) => !(process.env[k] || "").trim());
  return json({
    fonction: "OK",
    variables: missing.length ? "MANQUANTES : " + missing.join(", ") : "OK",
    categorie_des_tickets: process.env.DISCORD_HELP_CATEGORY_ID ? "DISCORD_HELP_CATEGORY_ID" : "même catégorie que les candidatures",
    plaintes_staff: process.env.DISCORD_ADMIN_ROLE_ID ? "réservées au rôle Admin" : "ATTENTION : DISCORD_ADMIN_ROLE_ID absent, tout le staff les verra",
  });
}
