# Llevar la tarjeta a la wallet del teléfono

La tarjeta ya vive en <https://tarjeta.easolutions.mx>. Esto agrega dos botones más:
**Añadir a Apple Wallet** (iPhone/Mac) y **Guardar en Google Wallet** (Android y escritorio).

Un pase en la wallet es cómodo para compartir: se abre sin buscar el navegador, trae tu QR
listo para que lo escaneen y en iPhone se puede mandar por AirDrop desde la misma app.

Los botones están ocultos hasta que configures cada plataforma, así que el sitio nunca
muestra un botón roto.

---

## Lo que cuesta y lo que no

| | Google Wallet | Apple Wallet |
|---|---|---|
| Costo | **Gratis** | **99 USD/año** (Apple Developer Program) |
| Qué necesitas | Cuenta de Google Cloud + alta en Google Wallet Business Console | Cuenta de desarrollador, un Pass Type ID y su certificado |
| Cómo funciona aquí | Una liga firmada, generada una vez y pegada en `index.html` | Un archivo `tarjeta.pkpass` firmado y subido al repo |
| Servidor | No hace falta | No hace falta |

No hay atajo para Apple: un `.pkpass` sin firma de un certificado de Apple no lo abre
ningún iPhone. Si no quieres pagar los 99 USD, quédate con Google Wallet — en iPhone
los visitantes siguen teniendo *Guardar contacto* (vCard) y el QR de siempre.

Todo lo que generes se firma **en tu computadora**. Las llaves nunca se suben:
`.gitignore` ya bloquea `wallet/certs/`, `.p12`, `.pem` y el JSON de la cuenta de servicio.

---

## 1. Tus datos (los dos pases leen de aquí)

Edita `wallet/pass.config.json`. Ahí están nombre, puesto, teléfono, correo, servicios,
colores y los identificadores de cada plataforma. Los scripts no leen `index.html`,
así que si cambias un dato actualízalo en los dos lugares.

---

## 2. Google Wallet (gratis, empieza por aquí)

1. **Alta como emisor**: entra a <https://pay.google.com/business/console>, sección
   Google Wallet API, y registra tu cuenta. Te dan un **Issuer ID** (19 dígitos).
2. **Cuenta de servicio**: en <https://console.cloud.google.com> crea un proyecto,
   habilita *Google Wallet API*, crea una cuenta de servicio y descarga su llave JSON.
   Guárdala como `wallet/certs/google-service-account.json`.
3. En la consola de Google Wallet, sección *Users*, agrega el correo de esa cuenta de
   servicio (`...@....iam.gserviceaccount.com`) con permiso de **Editor**.
4. Pon tu Issuer ID en `wallet/pass.config.json` → `google.issuerId`.
5. Genera la liga:

   ```bash
   node tools/build-google-jwt.mjs --aplicar
   ```

   `--aplicar` la escribe sola en `index.html` (`WALLET.google`). Sin esa bandera solo
   te la imprime y la deja en `wallet/google-link.txt` para que la pegues a mano.
6. `git add -A && git commit -m "feat: botón de Google Wallet" && git push`

La liga es estática y no caduca: se firma una vez y sirve para siempre. Solo hay que
volver a generarla si cambias tus datos. Mientras Google no apruebe tu cuenta de emisor,
el pase se guarda igual pero solo en los teléfonos que hayas dado de alta como *test users*.

---

## 3. Apple Wallet (requiere el programa de desarrollador)

1. Inscríbete en <https://developer.apple.com/programs/> (99 USD/año).
2. En *Certificates, Identifiers & Profiles* → **Identifiers** → `+` → **Pass Type IDs**,
   crea uno, por ejemplo `pass.mx.easolutions.tarjeta`.
3. Genera su certificado (te va a pedir un CSR: lo creas en Llavero → Asistente de
   certificación → Solicitar un certificado de una autoridad). Descárgalo, ábrelo,
   y en Llavero exporta la entrada **con su llave privada** como
   `wallet/certs/certificado.p12` — anota la contraseña que le pongas.
4. Descarga el certificado **Apple WWDR G4** de
   <https://www.apple.com/certificateauthority/> y conviértelo:

   ```bash
   openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wallet/certs/wwdr.pem
   ```
5. Pon tu **Team ID** (aparece en developer.apple.com → Membership) y el Pass Type ID
   en `wallet/pass.config.json` → `apple`.
6. Genera y firma el pase:

   ```bash
   P12_PASSWORD="la-contraseña-del-p12" node tools/build-pkpass.mjs
   ```

   Sale `tarjeta.pkpass` en la raíz. El script borra solo el certificado y la llave
   que extrajo mientras trabajaba.
7. En `index.html`, deja `apple: "tarjeta.pkpass"` dentro de `WALLET`.
8. `git add -A && git commit -m "feat: pase de Apple Wallet" && git push`

### Imágenes del pase (opcional)

Si no pones nada, el script arma los íconos a partir de `logo-light.png`. Para que se
vea nítido, deja en `wallet/images/`: `icon.png` (29×29), `icon@2x.png` (58×58),
`icon@3x.png` (87×87), `logo.png` (160×50) y `logo@2x.png` (320×100).

### Ojo con GitHub Pages y el `.pkpass`

Safari solo abre el pase si el servidor lo manda como `application/vnd.apple.pkpass`.
GitHub Pages normalmente acierta, pero no se puede configurar. Pruébalo desde un iPhone:
si en lugar de abrir Wallet te descarga un archivo raro, mueve el sitio a Cloudflare
Pages o Netlify — el archivo `_headers` de este repo ya trae la cabecera correcta y ambos
lo respetan. El resto de la tarjeta funciona igual en cualquiera de los tres.

---

## 4. Comprobar que quedó

- **Android**: abre la tarjeta → *Guardar en Google Wallet* → debe aparecer el pase con
  tu QR y los enlaces de WhatsApp, llamada y correo.
- **iPhone**: abre la tarjeta → *Añadir a Apple Wallet* → *Añadir*. Después, desde Wallet,
  el botón de compartir manda el pase por AirDrop o mensaje.
- **Escritorio**: solo se ve el botón de Google (el pase de Apple no sirve fuera de Apple).

Si un botón no aparece, es porque su campo en `WALLET` sigue vacío, o porque el
`.pkpass` todavía no está publicado en el sitio — la página lo verifica antes de mostrarlo.
