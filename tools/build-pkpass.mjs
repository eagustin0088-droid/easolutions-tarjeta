#!/usr/bin/env node
/**
 * Genera y firma el pase de Apple Wallet (.pkpass) de la tarjeta digital.
 *
 *   node tools/build-pkpass.mjs
 *
 * Requiere (ver WALLET.md):
 *   wallet/certs/certificado.p12   ← exportado desde Llavero (Pass Type ID)
 *   wallet/certs/wwdr.pem          ← Apple Worldwide Developer Relations G4
 *   variable de entorno P12_PASSWORD con la contraseña del .p12
 *
 * Salida: tarjeta.pkpass en la raíz del repo (se sube a GitHub y queda en
 * https://tarjeta.easolutions.mx/tarjeta.pkpass).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = (...p) => path.join(RAIZ, ...p);

const cfg = JSON.parse(fs.readFileSync(r("wallet", "pass.config.json"), "utf8"));
const CERTS = r("wallet", "certs");
const BUILD = r("tools", ".build");
const PASE = path.join(BUILD, "pass");

const salir = msg => { console.error("\n✖ " + msg + "\n"); process.exit(1); };
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });

/* ── 1. Verificaciones ──────────────────────────────────── */
if (cfg.apple.teamIdentifier.startsWith("X"))
  salir("Falta tu teamIdentifier real en wallet/pass.config.json (lo ves en developer.apple.com → Membership).");

const p12 = path.join(CERTS, "certificado.p12");
const wwdr = path.join(CERTS, "wwdr.pem");
if (!fs.existsSync(p12)) salir(`No encuentro ${path.relative(RAIZ, p12)}. Revisa WALLET.md, paso 3.`);
if (!fs.existsSync(wwdr)) salir(`No encuentro ${path.relative(RAIZ, wwdr)}. Descarga el certificado WWDR G4 de Apple y conviértelo a PEM (WALLET.md, paso 4).`);

const clave = process.env.P12_PASSWORD;
if (clave === undefined) salir('Falta la contraseña del .p12. Ejecuta:  P12_PASSWORD="tu-clave" node tools/build-pkpass.mjs');

/* ── 2. Carpeta limpia ──────────────────────────────────── */
fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(PASE, { recursive: true });

/* ── 3. pass.json ───────────────────────────────────────── */
const pass = {
  formatVersion: 1,
  passTypeIdentifier: cfg.apple.passTypeIdentifier,
  teamIdentifier: cfg.apple.teamIdentifier,
  serialNumber: cfg.apple.serialNumber,
  organizationName: cfg.empresa,
  description: `Tarjeta digital — ${cfg.nombre}`,
  logoText: cfg.empresa,
  foregroundColor: cfg.colores.texto,
  backgroundColor: cfg.colores.fondo,
  labelColor: cfg.colores.etiqueta,
  sharingProhibited: false,
  barcodes: [{
    format: "PKBarcodeFormatQR",
    message: cfg.url,
    messageEncoding: "iso-8859-1",
    altText: cfg.url.replace(/^https?:\/\//, "")
  }],
  generic: {
    primaryFields: [
      { key: "nombre", label: "", value: cfg.nombre }
    ],
    secondaryFields: [
      { key: "puesto", label: "PUESTO", value: cfg.puesto }
    ],
    auxiliaryFields: [
      { key: "telefono", label: "TELÉFONO", value: cfg.telefono },
      { key: "ciudad", label: "UBICACIÓN", value: cfg.ciudad, textAlignment: "PKTextAlignmentRight" }
    ],
    backFields: [
      { key: "tarjeta", label: "Tarjeta digital", value: cfg.url },
      { key: "whatsapp", label: "WhatsApp", value: `https://wa.me/${cfg.whatsapp}` },
      { key: "correo", label: "Correo", value: cfg.correo },
      { key: "sitio", label: "Sitio web", value: cfg.sitio },
      { key: "servicios", label: "Servicios", value: cfg.servicios }
    ]
  }
};
fs.writeFileSync(path.join(PASE, "pass.json"), JSON.stringify(pass, null, 2));

/* ── 4. Imágenes ────────────────────────────────────────── */
// Apple pide icon.png (29×29) e icon@2x.png; logo.png es opcional pero se ve mejor.
const IMGS = r("wallet", "images");
const requeridas = ["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png", "logo@3x.png", "strip.png", "strip@2x.png"];
let copiadas = 0;
for (const img of requeridas) {
  const origen = path.join(IMGS, img);
  if (fs.existsSync(origen)) { fs.copyFileSync(origen, path.join(PASE, img)); copiadas++; }
}

if (!fs.existsSync(path.join(PASE, "icon.png"))) {
  // Sin imágenes propias: derivamos los íconos del logo del sitio.
  const fuente = r("logo-light.png");
  const escalar = (destino, px) => {
    try { sh("sips", ["-Z", String(px), fuente, "--out", path.join(PASE, destino)]); return true; } catch {}
    try { sh("magick", [fuente, "-resize", `${px}x${px}`, path.join(PASE, destino)]); return true; } catch {}
    try { sh("convert", [fuente, "-resize", `${px}x${px}`, path.join(PASE, destino)]); return true; } catch {}
    return false;
  };
  const ok = escalar("icon.png", 29) && escalar("icon@2x.png", 58) && escalar("icon@3x.png", 87);
  if (!ok) {
    for (const [img] of [["icon.png"], ["icon@2x.png"], ["icon@3x.png"]])
      fs.copyFileSync(fuente, path.join(PASE, img));
    console.warn("⚠  Sin sips/ImageMagick: usé logo-light.png sin redimensionar como ícono.\n   Para que se vea nítido, pon icon.png (29×29), icon@2x.png (58×58) e icon@3x.png (87×87) en wallet/images/.");
  }
  if (!fs.existsSync(path.join(PASE, "logo.png"))) {
    fs.copyFileSync(fuente, path.join(PASE, "logo.png"));
    fs.copyFileSync(fuente, path.join(PASE, "logo@2x.png"));
  }
} else {
  console.log(`• ${copiadas} imágenes tomadas de wallet/images/`);
}

/* ── 5. manifest.json (SHA-1 de cada archivo) ───────────── */
const manifest = {};
for (const f of fs.readdirSync(PASE))
  manifest[f] = createHash("sha1").update(fs.readFileSync(path.join(PASE, f))).digest("hex");
fs.writeFileSync(path.join(PASE, "manifest.json"), JSON.stringify(manifest, null, 2));

/* ── 6. Firma PKCS#7 ────────────────────────────────────── */
const cert = path.join(BUILD, "cert.pem");
const key = path.join(BUILD, "key.pem");
const extraer = (args) => {
  try { sh("openssl", args); }
  catch (e) {
    // Los .p12 exportados por Llavero usan cifrado antiguo: OpenSSL 3 necesita -legacy.
    try { sh("openssl", [...args, "-legacy"]); }
    catch { salir("OpenSSL no pudo abrir el .p12. ¿La contraseña de P12_PASSWORD es correcta?\n  " + String(e.stderr || e.message).trim()); }
  }
};
extraer(["pkcs12", "-in", p12, "-clcerts", "-nokeys", "-out", cert, "-passin", `pass:${clave}`]);
extraer(["pkcs12", "-in", p12, "-nocerts", "-nodes", "-out", key, "-passin", `pass:${clave}`]);

try {
  sh("openssl", ["smime", "-binary", "-sign",
    "-certfile", wwdr, "-signer", cert, "-inkey", key,
    "-in", path.join(PASE, "manifest.json"),
    "-out", path.join(PASE, "signature"),
    "-outform", "DER"]);
} catch (e) {
  salir("Falló la firma del manifiesto:\n  " + String(e.stderr || e.message).trim());
}

/* ── 7. Empaquetado .pkpass ─────────────────────────────── */
const salida = r(cfg.apple.salida);
fs.rmSync(salida, { force: true });
const archivos = fs.readdirSync(PASE);           // rutas planas, sin subcarpetas
try {
  sh("zip", ["-X", "-q", salida, ...archivos], { cwd: PASE });
} catch (e) {
  salir("No encontré el comando `zip`. En macOS ya viene incluido; en Windows usa WSL o Git Bash.\n  " + String(e.stderr || e.message).trim());
}

/* ── 8. Limpieza: el certificado y la llave nunca se quedan en disco ── */
fs.rmSync(BUILD, { recursive: true, force: true });

const kb = (fs.statSync(salida).size / 1024).toFixed(1);
console.log(`\n✔ ${cfg.apple.salida} generado (${kb} KB) con ${archivos.length} archivos.`);
console.log("  Ahora: git add " + cfg.apple.salida + " && git commit && git push");
console.log("  Y en index.html deja  WALLET.apple = \"" + cfg.apple.salida + "\"\n");
