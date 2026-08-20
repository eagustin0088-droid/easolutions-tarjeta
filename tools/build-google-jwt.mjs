#!/usr/bin/env node
/**
 * Genera la liga "Guardar en Google Wallet" de la tarjeta digital.
 *
 *   node tools/build-google-jwt.mjs            → imprime la liga
 *   node tools/build-google-jwt.mjs --aplicar  → además la escribe en index.html
 *
 * Requiere (ver WALLET.md): wallet/certs/google-service-account.json,
 * la cuenta de servicio con rol de editor en Google Wallet Business Console.
 *
 * La liga es estática: se firma una vez y sirve para siempre, sin servidor.
 * Solo hay que regenerarla si cambian tus datos.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = (...p) => path.join(RAIZ, ...p);
const salir = m => { console.error("\n✖ " + m + "\n"); process.exit(1); };

const cfg = JSON.parse(fs.readFileSync(r("wallet", "pass.config.json"), "utf8"));
const g = cfg.google;

const rutaSA = r("wallet", "certs", g.cuentaServicio);
if (!fs.existsSync(rutaSA))
  salir(`No encuentro ${path.relative(RAIZ, rutaSA)} (el JSON de la cuenta de servicio). Revisa WALLET.md, paso 2 de Google.`);
if (/^3388000000000000000$/.test(g.issuerId))
  salir("Falta tu issuerId real en wallet/pass.config.json (lo da Google Wallet Business Console).");

const sa = JSON.parse(fs.readFileSync(rutaSA, "utf8"));
if (!sa.private_key || !sa.client_email) salir("Ese JSON no parece una cuenta de servicio de Google Cloud.");

const claseId  = `${g.issuerId}.${g.claseId}`;
const objetoId = `${g.issuerId}.${g.objetoId}`;
const idioma   = "es-MX";
const loc = valor => ({ defaultValue: { language: idioma, value: valor } });

/* La clase y el objeto viajan dentro del JWT: Google los crea al guardar,
   así que no hace falta llamar a la API ni tener backend. */
const clase = {
  id: claseId,
  issuerName: cfg.empresa,
  reviewStatus: "UNDER_REVIEW",
  hexBackgroundColor: cfg.colores.googleHex,
  logo: { sourceUri: { uri: g.logoUrl }, contentDescription: loc(cfg.empresa) }
};

const objeto = {
  id: objetoId,
  classId: claseId,
  state: "ACTIVE",
  hexBackgroundColor: cfg.colores.googleHex,
  logo: { sourceUri: { uri: g.logoUrl }, contentDescription: loc(cfg.empresa) },
  cardTitle: loc(cfg.empresa),
  header: loc(cfg.nombre),
  subheader: loc(cfg.puesto),
  barcode: {
    type: "QR_CODE",
    value: cfg.url,
    alternateText: cfg.url.replace(/^https?:\/\//, "")
  },
  textModulesData: [
    { id: "telefono", header: "Teléfono", body: cfg.telefono },
    { id: "correo",   header: "Correo",   body: cfg.correo },
    { id: "servicios", header: "Servicios", body: cfg.servicios }
  ],
  linksModuleData: {
    uris: [
      { id: "tarjeta",  uri: cfg.url, description: "Tarjeta digital" },
      { id: "whatsapp", uri: `https://wa.me/${cfg.whatsapp}`, description: "WhatsApp" },
      { id: "llamar",   uri: `tel:${cfg.telefonoRaw}`, description: "Llamar" },
      { id: "correo",   uri: `mailto:${cfg.correo}`, description: "Correo" },
      { id: "sitio",    uri: cfg.sitio, description: "Sitio web" }
    ]
  }
};

/* ── Firma RS256 ────────────────────────────────────────── */
const b64 = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");
const encabezado = { alg: "RS256", typ: "JWT" };
const cuerpo = {
  iss: sa.client_email,
  aud: "google",
  typ: "savetowallet",
  iat: Math.floor(Date.now() / 1000),
  origins: [cfg.url],
  payload: { genericClasses: [clase], genericObjects: [objeto] }
};

const base = `${b64(encabezado)}.${b64(cuerpo)}`;
const firma = crypto.createSign("RSA-SHA256").update(base).sign(sa.private_key, "base64url");
const liga = `https://pay.google.com/gp/v/save/${base}.${firma}`;

fs.writeFileSync(r("wallet", "google-link.txt"), liga + "\n");

/* ── Salida ─────────────────────────────────────────────── */
if (process.argv.includes("--aplicar")) {
  const idx = r("index.html");
  const html = fs.readFileSync(idx, "utf8");
  const nuevo = html.replace(/(google:\s*)"[^"]*"/, `$1"${liga}"`);
  if (nuevo === html) salir('No encontré  google: "…"  en index.html; pega la liga a mano.');
  fs.writeFileSync(idx, nuevo);
  console.log("\n✔ Liga escrita en index.html (WALLET.google).");
} else {
  console.log("\n" + liga + "\n");
  console.log('→ Pégala en index.html, en  WALLET.google  (o corre este script con --aplicar).');
}
console.log(`(Guardada también en wallet/google-link.txt · ${liga.length} caracteres)\n`);
