# Twitch VOD + Chat Downloader (Local)

Aplicacion local para descargar un VOD publico de Twitch y generar salidas separadas para editar en CapCut:

- `vod.mp4` (video limpio)
- `chat-alpha.mov` (render del chat con fondo transparente, alpha, comprimido para edicion)

El JSON del chat se usa de forma temporal para renderizar y luego se elimina automaticamente.

Todo se guarda en `~/Downloads/twitch-vods-download/YYYY-MM-DD/<vodId>/`.

## Requisitos

1. Node.js 22.12+ (recomendado por Astro 7).
2. `TwitchDownloaderCLI` disponible en `PATH`, o ruta en variable de entorno `TWITCH_DOWNLOADER_CLI`, o binario local en `tools/TwitchDownloaderCLI/TwitchDownloaderCLI`.
3. `ffmpeg` en `PATH`.

### macOS ejemplo rapido

```sh
brew install ffmpeg
```

Para `TwitchDownloaderCLI`, descarga el binario adecuado (arm64/x64) desde releases oficiales, dale permisos y anadelo al `PATH`. Tambien puedes dejarlo en `tools/TwitchDownloaderCLI/TwitchDownloaderCLI`.

Ejemplo macOS Apple Silicon (arm64):

```sh
mkdir -p tools
curl -fL -o tools/TwitchDownloaderCLI-MacOSArm64.zip https://github.com/lay295/TwitchDownloader/releases/download/1.56.4/TwitchDownloaderCLI-1.56.4-MacOSArm64.zip
unzip -o tools/TwitchDownloaderCLI-MacOSArm64.zip -d tools/TwitchDownloaderCLI
chmod +x tools/TwitchDownloaderCLI/TwitchDownloaderCLI
```

## Uso

```sh
npm install
npm run dev
```

Esto arranca:

- Web Astro: `http://localhost:4321`
- API local: `http://localhost:8787`

En la UI pega una URL tipo:

`https://www.twitch.tv/videos/2818539320`

y pulsa **Generar Archivos**.

## Endpoints locales

- `GET /api/health`: valida preflight (`TwitchDownloaderCLI` y `ffmpeg`).
- `POST /api/jobs`: inicia un trabajo (`{ "url": "..." }` o `{ "id": "..." }`).
- `GET /api/jobs/:id`: estado, logs y salidas del trabajo.

## Estructura relevante

```text
server/
  index.mjs          # API Express
  jobs.mjs           # Pipeline de comandos TwitchDownloaderCLI
  preflight.mjs      # Verifica binarios requeridos
  url.mjs            # Parseo URL/ID de VOD
  output-path.mjs    # Carpeta outputs por fecha + id
src/pages/index.astro # UI minima
```

## Notas

- MVP limita a 1 job concurrente para simplificar.
- Solo VODs publicos; para sub-only se requeriria OAuth y no esta en este MVP.
- El pipeline reintenta automaticamente errores de red/TLS temporales en `videodownload` y `chatdownload`.
- Si falla el render transparente por errores de pipe/encoder, se aplica fallback automatico a un codec alternativo.
- El pipeline usa `--temp-path` dentro de la carpeta del trabajo en Descargas para no depender de `/var/folders`.
- Si aparece "No hay espacio suficiente", libera espacio en disco y reintenta.
- El render de chat usa un preset de mayor nitidez (chat mas grande, fuente mas grande y outline) para mejorar legibilidad en edicion.
