export function parseVodInput(rawInput) {
    const input = (rawInput ?? '').trim()

    if (!input) {
        throw new Error('Debes indicar una URL o ID de VOD.')
    }

    if (/^\d+$/.test(input)) {
        return {
            vodId: input,
            source: input,
        }
    }

    let parsed
    try {
        parsed = new URL(input)
    } catch {
        throw new Error(
            'Formato invalido. Usa una URL de Twitch o un ID numerico.',
        )
    }

    const isTwitchHost =
        parsed.hostname === 'twitch.tv' ||
        parsed.hostname === 'www.twitch.tv' ||
        parsed.hostname.endsWith('.twitch.tv')

    if (!isTwitchHost) {
        throw new Error('La URL no pertenece a Twitch.')
    }

    const match = parsed.pathname.match(/^\/videos\/(\d+)(?:\/)?$/)
    if (!match) {
        throw new Error('La URL debe seguir el formato /videos/<id>.')
    }

    return {
        vodId: match[1],
        source: input,
    }
}
