import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

export function getConfiguredCliPath() {
    const fromEnv = process.env.TWITCH_DOWNLOADER_CLI?.trim()
    if (fromEnv) {
        return fromEnv
    }

    const localBundled = path.join(
        process.cwd(),
        'tools',
        'TwitchDownloaderCLI',
        'TwitchDownloaderCLI',
    )

    const localCheck = spawnSync(localBundled, ['help'], { encoding: 'utf8' })
    if (localCheck.status === 0 || localCheck.status === 1) {
        return localBundled
    }

    // Fallbacks for user-installed binaries on PATH.
    if (isCommandAvailable('TwitchDownloaderCLI', ['help'])) {
        return 'TwitchDownloaderCLI'
    }

    if (isCommandAvailable('twitchdownloadercli', ['help'])) {
        return 'twitchdownloadercli'
    }

    return 'TwitchDownloaderCLI'
}

function isCommandAvailable(command, args = ['--help']) {
    const result = spawnSync(command, args, { encoding: 'utf8' })
    return result.status === 0 || result.status === 1
}

export async function runPreflightChecks() {
    const cliPath = getConfiguredCliPath()

    if (cliPath.includes('/') || cliPath.startsWith('.')) {
        try {
            await access(cliPath, constants.X_OK)
        } catch {
            throw new Error(`No encuentro TwitchDownloaderCLI en ${cliPath}`)
        }
    } else if (!isCommandAvailable(cliPath, ['help'])) {
        throw new Error(
            'No puedo ejecutar TwitchDownloaderCLI. Instala el binario en PATH, define TWITCH_DOWNLOADER_CLI, o usa tools/TwitchDownloaderCLI/TwitchDownloaderCLI.',
        )
    }

    if (!isCommandAvailable('ffmpeg', ['-version'])) {
        throw new Error(
            'ffmpeg no esta disponible en PATH. Instala ffmpeg antes de continuar.',
        )
    }

    return { cliPath }
}
