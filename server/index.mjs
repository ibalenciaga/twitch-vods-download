import express from 'express'
import cors from 'cors'
import { runPreflightChecks } from './preflight.mjs'
import { getJob, startJob } from './jobs.mjs'

const app = express()
const port = Number(process.env.API_PORT || 8787)

app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', async (_req, res) => {
    try {
        const preflight = await runPreflightChecks()
        res.json({ ok: true, preflight })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        res.status(500).json({ ok: false, error: message })
    }
})

app.post('/api/jobs', async (req, res) => {
    try {
        const input = req.body?.url ?? req.body?.id ?? ''
        const preflight = await runPreflightChecks()
        const job = startJob({ input, cliPath: preflight.cliPath })
        res.status(201).json({ ok: true, job })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        res.status(400).json({ ok: false, error: message })
    }
})

app.get('/api/jobs/:id', (req, res) => {
    const job = getJob(req.params.id)
    if (!job) {
        res.status(404).json({ ok: false, error: 'Trabajo no encontrado.' })
        return
    }
    res.json({ ok: true, job })
})

app.listen(port, () => {
    // Keep this line plain for quick local troubleshooting in terminal.
    console.log(`[api] http://localhost:${port}`)
})
