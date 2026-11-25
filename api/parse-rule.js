/**
 * Vercel serverless function: POST /api/parse-rule
 * The OpenAI key is read inside server/parseRule.js from the server environment.
 */

import { handleParseRule } from '../server/parseRule.js'

export default async function handler(req, res) {
  try {
    const result = await handleParseRule(req.method, req.body)
    res.status(result.statusCode).json(result.body)
  } catch {
    res.status(500).json({
      status: 'error',
      message: 'The rule parser hit an unexpected error. Please try again.',
    })
  }
}
