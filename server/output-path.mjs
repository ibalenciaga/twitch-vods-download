import fs from 'node:fs'
import path from 'node:path'

function getLocalDateStamp(date = new Date()) {
    const year = String(date.getFullYear())
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export function ensureJobOutputDirectory(vodId) {
    const downloadsDir = path.join(
        process.env.HOME || process.cwd(),
        'Downloads',
    )
    const dateStamp = getLocalDateStamp()
    const parentDir = path.join(downloadsDir, 'twitch-vods-download', dateStamp)
    fs.mkdirSync(parentDir, { recursive: true })

    let candidate = path.join(parentDir, vodId)
    let suffix = 2

    while (fs.existsSync(candidate)) {
        candidate = path.join(parentDir, `${vodId}-${suffix}`)
        suffix += 1
    }

    fs.mkdirSync(candidate, { recursive: true })
    return candidate
}
