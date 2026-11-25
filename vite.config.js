import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleParseRule } from './server/parseRule.js'

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 20000) {
        reject(Object.assign(new Error('too_large'), { code: 'too_large' }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function localParseRulePlugin() {
  return {
    name: 'local-parse-rule',
    configureServer(server) {
      server.middlewares.use('/api/parse-rule', async (req, res) => {
        try {
          const raw = await readRequestBody(req)
          const result = await handleParseRule(req.method, raw)
          res.statusCode = result.statusCode
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(result.body))
        } catch (error) {
          const tooLarge = error?.code === 'too_large'
          res.statusCode = tooLarge ? 413 : 400
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({
            status: 'error',
            message: tooLarge ? 'Request is too large.' : 'Request body must be JSON.',
          }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = env.OPENAI_API_KEY
  }
  if (env.OPENAI_MODEL && !process.env.OPENAI_MODEL) {
    process.env.OPENAI_MODEL = env.OPENAI_MODEL
  }

  return {
    plugins: [react(), localParseRulePlugin()],
    server: {
      port: 5173,
    },
    optimizeDeps: {
      include: ['pdfjs-dist'],
    },
  }
})
