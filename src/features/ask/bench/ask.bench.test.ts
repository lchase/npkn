/**
 * Compare local models on the real Ask pipeline, using the sample notebook.
 *
 *   BENCH_MODELS=qwen3.5:4b,granite4:3b BENCH_RUNS=2 npx vitest run src/features/ask/bench
 *
 * Skipped unless BENCH_MODELS is set, so a normal `npm test` never touches Ollama. It builds the exact
 * system prompt the app would send (retrieval included), asks each question of each model, and scores
 * the answer against facts that are in the sample notebook.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildSamplePages } from '../../../data/sampleData'
import { buildContext } from '../retrieve'
import { ollamaProvider } from '../ollama'

const MODELS = (process.env.BENCH_MODELS ?? '').split(',').map(s => s.trim()).filter(Boolean)
const RUNS = Number(process.env.BENCH_RUNS ?? 2)
const BASE = process.env.OLLAMA_BASE ?? 'http://localhost:11434'
const OUT = process.env.BENCH_OUT

interface Case {
  id: string
  q: string
  /** Every one of these must appear (facts). */
  all?: RegExp[]
  /** At least this many of `any` must appear. */
  any?: { of: RegExp[]; min: number }
  /** The notebook doesn't contain the answer; the right behaviour is to say so and not invent one. */
  abstain?: boolean
}

const ABSTAIN =
  /\b(do(es)? not|did not|don'?t|doesn'?t|didn'?t) (say|mention|contain|include|have|specify|state|list|provide|know|see|find|appear)|\b(is|are) no\b|\bno (information|mention|record|data|details|\w+ name)|\bnot (in|found|mentioned|contained|included|stated|available|provided|specified|recorded|listed)|\b(cannot|can'?t|couldn'?t|unable to) (find|determine|answer|locate)|\bcontains? no\b|\bthere is no\b/i

const CASES: Case[] = [
  { id: 'sync', q: 'Which sync approach did we pick, and what did we use before?', all: [/websocket/i, /polling/i] },
  { id: 'tidewater', q: 'What did Tidewater ask for on the call, and what price did we quote?', all: [/500/, /csv/i, /okta/i, /\$?14\b|\$?840/] },
  { id: 'rollback', q: 'How do I roll back a bad deploy, and who is on call?', all: [/rollback/i, /oncall-lantern|on-call/i] },
  { id: 'budget', q: 'How much is the Q4 budget for contractors, and who must approve spend over a limit?', all: [/52,?000|52k/i, /priya/i, /lena/i] },
  { id: 'lisbon', q: 'When does the Lisbon flight leave?', all: [/november 6|nov\.? 6|6 november/i, /08:15|8:15/] },
  { id: 'priya', q: "What is Priya's preferred way to get updates?", all: [/writ(ten|ing)/i] },
  { id: 'slip', q: 'If the Android performance sign-off slips, what happens to the release date?', all: [/december 4|dec\.? 4|4 december/i] },
  { id: 'infra', q: 'How much did infrastructure go over plan in September and why?', all: [/4,?100/, /(log )?retention/i] },
  { id: 'overdue', q: "What's overdue?", any: { of: [/websocket decision/i, /contractor/i, /sign-?off/i, /birthday/i, /conference booth/i], min: 3 } },
  { id: 'abstain-salary', q: "What is Marcus Webb's salary?", abstain: true },
  { id: 'abstain-ceo', q: "What is the CEO's name?", abstain: true },
]

interface Row {
  model: string
  id: string
  pass: boolean
  cited: boolean
  falseAbstain: boolean
  firstMs: number
  totalMs: number
  words: number
  answer: string
}

async function ask(model: string, q: string, system: string) {
  const t0 = performance.now()
  let first = 0
  let text = ''
  for await (const piece of ollamaProvider.chat({
    base: BASE,
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: q },
    ],
  })) {
    if (!first) first = performance.now() - t0
    text += piece
  }
  return { text, firstMs: first, totalMs: performance.now() - t0 }
}

function score(c: Case, text: string) {
  const abstained = ABSTAIN.test(text)
  if (c.abstain) {
    // Right answer is "it's not in the notes", with no invented figure or name.
    const invented = /\$\s?\d|\b\d{2,3},\d{3}\b/.test(text)
    return { pass: abstained && !invented, falseAbstain: false }
  }
  const factsOk = c.all ? c.all.every(r => r.test(text)) : true
  const anyOk = c.any ? c.any.of.filter(r => r.test(text)).length >= c.any.min : true
  const pass = factsOk && anyOk
  return { pass, falseAbstain: !pass && abstained }
}

describe.skipIf(MODELS.length === 0)('Ask model benchmark', () => {
  it(
    'runs every model over every question',
    async () => {
      const pages = buildSamplePages()
      const rows: Row[] = []

      for (const model of MODELS) {
        // Warm up so model load time isn't charged to the first question.
        await ask(model, 'Reply with the single word: ready', 'You are a test.').catch(() => undefined)
        for (let run = 0; run < RUNS; run++) {
          for (const c of CASES) {
            const { system } = buildContext(pages, c.q)
            const r = await ask(model, c.q, system)
            const s = score(c, r.text)
            rows.push({
              model,
              id: c.id,
              pass: s.pass,
              cited: /\[\d+\]/.test(r.text),
              falseAbstain: s.falseAbstain,
              firstMs: r.firstMs,
              totalMs: r.totalMs,
              words: r.text.trim().split(/\s+/).length,
              answer: r.text.trim(),
            })
          }
        }
      }

      if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows, null, 2))

      const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
      const summary = MODELS.map(model => {
        const mine = rows.filter(r => r.model === model)
        const answerable = mine.filter(r => !CASES.find(c => c.id === r.id)!.abstain)
        const abst = mine.filter(r => CASES.find(c => c.id === r.id)!.abstain)
        return {
          model,
          correct: `${mine.filter(r => r.pass).length}/${mine.length}`,
          answerable: `${answerable.filter(r => r.pass).length}/${answerable.length}`,
          abstains: `${abst.filter(r => r.pass).length}/${abst.length}`,
          citedWhenAnswering: `${answerable.filter(r => r.cited).length}/${answerable.length}`,
          falseAbstain: answerable.filter(r => r.falseAbstain).length,
          firstTokenMs: Math.round(med(mine.map(r => r.firstMs))),
          totalMs: Math.round(med(mine.map(r => r.totalMs))),
          words: Math.round(med(mine.map(r => r.words))),
        }
      })
      console.table(summary)
      expect(rows.length).toBe(MODELS.length * RUNS * CASES.length)
    },
    { timeout: 60 * 60 * 1000 },
  )
})
