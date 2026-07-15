import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { ensureJobOutputDirectory } from './output-path.mjs'
import { parseVodInput } from './url.mjs'

const jobs = new Map()
let activeJobId = null

function createId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function createStep(name, command) {
    return {
        name,
        command,
        status: 'pending',
        startedAt: null,
        endedAt: null,
        exitCode: null,
    }
}

function shellQuote(value) {
    const input = String(value ?? '')
    if (/^[A-Za-z0-9_./:-]+$/.test(input)) {
        return input
    }
    return `'${input.replace(/'/g, `'\\''`)}'`
}

function runCommand(command, args, cwd, onLog) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, env: process.env })
        let combinedOutput = ''

        child.stdout.on('data', (chunk) => {
            const text = chunk.toString()
            combinedOutput += text
            onLog(text)
        })

        child.stderr.on('data', (chunk) => {
            const text = chunk.toString()
            combinedOutput += text
            onLog(text)
        })

        child.on('error', (error) => {
            reject(error)
        })

        child.on('close', (code, signal) => {
            if (code === 0) {
                resolve()
                return
            }

            const failure = new Error(
                `Comando fallido (code=${String(code)}, signal=${String(signal)}): ${command}`,
            )
            failure.code = code
            failure.signal = signal
            failure.output = combinedOutput
            reject(failure)
        })
    })
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientNetworkFailure(error) {
    const haystack = `${error?.message || ''}\n${error?.output || ''}`
    return /ssl connection could not be established|connection reset by peer|httprequestexception|socketexception|timed out|temporarily unavailable|network is unreachable/i.test(
        haystack,
    )
}

function isRenderPipeFailure(error) {
    const haystack = `${error?.message || ''}\n${error?.output || ''}`
    return /broken pipe|sigabrt|unknown encoder|error while opening encoder|conversion failed|ffmpeg/i.test(
        haystack,
    )
}

function isNoSpaceFailure(error) {
    const haystack = `${error?.message || ''}\n${error?.output || ''}`
    return /no space left on device|enospc/i.test(haystack)
}

async function runCommandWithRetries({
    cliPath,
    commandArgs,
    cwd,
    onLog,
    retries = 1,
}) {
    const attempts = Math.max(1, retries)

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await runCommand(cliPath, commandArgs, cwd, onLog)
            return
        } catch (error) {
            const isLastAttempt = attempt >= attempts
            const transient = isTransientNetworkFailure(error)

            if (isLastAttempt || !transient) {
                throw error
            }

            const backoffMs = attempt * 3000
            onLog(
                `[retry] Error de red temporal detectado. Reintento ${attempt + 1}/${attempts} en ${Math.round(backoffMs / 1000)}s...`,
            )
            await sleep(backoffMs)
        }
    }
}

function toPublicPath(absolutePath) {
    const root = process.cwd()
    return path.relative(root, absolutePath).replaceAll(path.sep, '/')
}

function setStepState(job, index, status) {
    const step = job.steps[index]
    step.status = status
    if (status === 'running') {
        step.startedAt = new Date().toISOString()
    }
    if (status === 'done' || status === 'error') {
        step.endedAt = new Date().toISOString()
    }
}

function appendLog(job, message) {
    const line = message.replace(/\r/g, '')
    if (!line.trim()) {
        return
    }

    const now = new Date().toISOString()
    for (const split of line.split('\n')) {
        const trimmed = split.trimEnd()
        if (!trimmed) {
            continue
        }
        job.logs.push(`[${now}] ${trimmed}`)
        if (job.logs.length > 500) {
            job.logs.shift()
        }
    }
}

async function runPipeline(job, cliPath) {
    const cwd = process.cwd()
    const outputDir = job.outputDir

    const vodPath = path.join(outputDir, 'vod.mp4')
    const chatJsonPath = path.join(outputDir, '.chat.tmp.json')
    const chatAlphaPath = path.join(outputDir, 'chat-alpha.mov')
    const tempPath = path.join(outputDir, '.td-temp')
    fs.mkdirSync(tempPath, { recursive: true })

    const commands = [
        {
            stepIndex: 0,
            retries: 3,
            args: [
                'videodownload',
                '--id',
                job.source,
                '--collision',
                'Overwrite',
                '--temp-path',
                tempPath,
                '-o',
                vodPath,
            ],
        },
        {
            stepIndex: 1,
            retries: 3,
            args: [
                'chatdownload',
                '--id',
                job.source,
                '--embed-images',
                '--collision',
                'Overwrite',
                '--temp-path',
                tempPath,
                '-o',
                chatJsonPath,
            ],
        },
        {
            stepIndex: 2,
            retries: 1,
            args: [
                'chatrender',
                '-i',
                chatJsonPath,
                '--chat-width',
                '350',
                '--chat-height',
                '300',
                '--font-size',
                '14',
                '--outline',
                '--outline-size',
                '1',
                '--framerate',
                '15',
                '--background-color',
                '#00000000',
                '--emoji-vendor',
                'system',
                '--offline',
                '--output-args=-c:v hevc_videotoolbox -allow_sw 1 -alpha_quality 1.0 -q:v 90 -vtag hvc1 "{save_path}"',
                '--collision',
                'Overwrite',
                '--temp-path',
                tempPath,
                '-o',
                chatAlphaPath,
            ],
            fallbackArgs: [
                'chatrender',
                '-i',
                chatJsonPath,
                '--chat-width',
                '350',
                '--chat-height',
                '300',
                '--font-size',
                '14',
                '--outline',
                '--outline-size',
                '1',
                '--framerate',
                '12',
                '--background-color',
                '#00000000',
                '--emoji-vendor',
                'system',
                '--offline',
                '--output-args=-c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le "{save_path}"',
                '--collision',
                'Overwrite',
                '--temp-path',
                tempPath,
                '-o',
                chatAlphaPath,
            ],
        },
    ]

    try {
        for (const command of commands) {
            const step = job.steps[command.stepIndex]
            setStepState(job, command.stepIndex, 'running')

            const renderedCommand = [cliPath, ...command.args]
                .map(shellQuote)
                .join(' ')
            appendLog(job, `> ${renderedCommand}`)

            try {
                await runCommandWithRetries({
                    cliPath,
                    commandArgs: command.args,
                    cwd,
                    retries: command.retries,
                    onLog: (line) => appendLog(job, line),
                })
                step.exitCode = 0
                setStepState(job, command.stepIndex, 'done')
            } catch (error) {
                if (command.fallbackArgs && isRenderPipeFailure(error)) {
                    appendLog(
                        job,
                        '[retry] Fallo de render detectado. Reintentando chat-alpha.mov con codec alternativo...',
                    )

                    try {
                        await runCommandWithRetries({
                            cliPath,
                            commandArgs: command.fallbackArgs,
                            cwd,
                            retries: 1,
                            onLog: (line) => appendLog(job, line),
                        })
                        step.exitCode = 0
                        setStepState(job, command.stepIndex, 'done')
                        continue
                    } catch (fallbackError) {
                        if (isNoSpaceFailure(fallbackError)) {
                            throw new Error(
                                'No hay espacio suficiente para renderizar chat-alpha.mov. Libera espacio en disco y vuelve a intentarlo.',
                            )
                        }

                        step.exitCode = 1
                        setStepState(job, command.stepIndex, 'error')
                        throw fallbackError
                    }
                }

                if (isNoSpaceFailure(error)) {
                    throw new Error(
                        'No hay espacio suficiente para renderizar chat-alpha.mov. Libera espacio en disco y vuelve a intentarlo.',
                    )
                }

                step.exitCode = 1
                setStepState(job, command.stepIndex, 'error')
                throw error
            }
        }

        job.outputs = {
            vod: toPublicPath(vodPath),
            chatAlphaMov: toPublicPath(chatAlphaPath),
        }
    } finally {
        if (fs.existsSync(chatJsonPath)) {
            fs.rmSync(chatJsonPath)
        }

        if (fs.existsSync(tempPath)) {
            fs.rmSync(tempPath, { recursive: true, force: true })
        }
    }
}

export function startJob({ input, cliPath }) {
    if (activeJobId) {
        const active = jobs.get(activeJobId)
        if (active && active.status === 'running') {
            throw new Error(
                'Ya hay un trabajo en ejecucion. Espera a que termine.',
            )
        }
    }

    const { vodId, source } = parseVodInput(input)
    const outputDir = ensureJobOutputDirectory(vodId)
    const id = createId()

    const job = {
        id,
        vodId,
        source,
        status: 'running',
        error: null,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        finishedAt: null,
        outputDir,
        outputDirRelative: toPublicPath(outputDir),
        outputs: null,
        logs: [],
        steps: [
            createStep('Descargar VOD', 'videodownload'),
            createStep('Descargar chat JSON', 'chatdownload'),
            createStep('Renderizar chat MOV transparente', 'chatrender'),
        ],
    }

    jobs.set(id, job)
    activeJobId = id

    runPipeline(job, cliPath)
        .then(() => {
            job.status = 'done'
            job.finishedAt = new Date().toISOString()
        })
        .catch((error) => {
            job.status = 'error'
            job.error = error instanceof Error ? error.message : String(error)
            job.finishedAt = new Date().toISOString()
            appendLog(job, `ERROR: ${job.error}`)
        })
        .finally(() => {
            activeJobId = null
        })

    return serializeJob(job)
}

export function getJob(jobId) {
    const job = jobs.get(jobId)
    if (!job) {
        return null
    }
    return serializeJob(job)
}

function serializeJob(job) {
    return {
        id: job.id,
        vodId: job.vodId,
        source: job.source,
        status: job.status,
        error: job.error,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        outputDir: job.outputDirRelative,
        outputs: job.outputs,
        logs: [...job.logs],
        steps: job.steps.map((step) => ({ ...step })),
    }
}
