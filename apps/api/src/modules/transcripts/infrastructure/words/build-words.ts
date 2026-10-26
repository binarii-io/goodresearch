// Builds the common-word lists of the lexicon rules (spec 010 research R2), by hand, never in CI:
//
//   npm pack wordlist-english@1.2.1 dictionary-fr@3.0.0   (in an empty folder)
//   tar -xzf wordlist-english-1.2.1.tgz -C en && tar -xzf dictionary-fr-3.0.0.tgz -C fr
//   node build-words.ts <folder>/en/package <folder>/fr/package
//
// English: SCOWL up to size 60 (English, American and British spellings). French: the Hunspell
// dictionary of Grammalecte (Dicollecte, MPL-2.0) with its suffixes applied. Proper nouns are left
// out (a place or a product name must stay a candidate), except English weekdays, months and a few
// nationalities, written with a capital in every sentence. Words are folded like `fold` of
// `@goodresearch/shared` (lower case, no accents, straight apostrophes), one per line, gzipped.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")

const isProper = (word: string) => /^\p{Lu}/u.test(word)
const out = new URL('.', import.meta.url).pathname

const write = (name: string, words: Iterable<string>) => {
  const sorted = [...new Set(words)].filter((w) => w.length > 0).sort()
  writeFileSync(join(out, name), gzipSync(`${sorted.join('\n')}\n`, { level: 9 }))
  console.log(name, sorted.length, 'words')
}

/** Contractions SCOWL does not list. */
const CONTRACTIONS =
  "don't doesn't didn't can't couldn't won't wouldn't shouldn't isn't aren't wasn't weren't haven't hasn't hadn't mustn't i'm i've i'll i'd you're you've you'll you'd he's he'll he'd she's she'll she'd it's it'll it'd we're we've we'll we'd they're they've they'll they'd that's there's here's what's who's let's y'all"

/** English words always written with a capital, yet common. */
const CAPITALISED =
  'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december english french german spanish italian european american british'

const english = (folder: string) => {
  const words: string[] = [...CONTRACTIONS.split(' '), ...CAPITALISED.split(' ')]
  for (const variant of ['english', 'american', 'british'])
    for (const size of [10, 20, 35, 40, 50, 55, 60]) {
      const list = JSON.parse(
        readFileSync(join(folder, `${variant}-words-${size}.json`), 'utf8'),
      ) as string[]
      for (const w of list) if (!isProper(w)) words.push(fold(w))
    }
  return words
}

type Rule = { strip: string; add: string; next: string[]; condition: RegExp }

/** Hunspell suffixes (`SFX`, `FLAG long`), with one level of continuation; prefixes are elisions. */
const french = (folder: string) => {
  const aff = readFileSync(join(folder, 'index.aff'), 'utf8').split('\n')
  const flags = (s: string | undefined) => (s ? (s.match(/../g) ?? []) : [])
  const suffixes = new Map<string, Rule[]>()
  for (const line of aff) {
    const parts = line.trim().split(/\s+/)
    if (parts[0] !== 'SFX' || parts.length < 5) continue
    const [, flag = '', strip = '', addAndNext = '', condition = '.'] = parts
    const [add = '', next] = addAndNext.split('/')
    suffixes.set(flag, [
      ...(suffixes.get(flag) ?? []),
      {
        strip: strip === '0' ? '' : strip,
        add: add === '0' ? '' : add,
        next: flags(next),
        condition: new RegExp(`${condition}$`, 'u'),
      },
    ])
  }
  const words: string[] = []
  const expand = (word: string, wordFlags: string[], depth: number) => {
    words.push(fold(word))
    if (depth > 1) return
    for (const flag of wordFlags)
      for (const rule of suffixes.get(flag) ?? []) {
        if (!rule.condition.test(word) || !word.endsWith(rule.strip)) continue
        const form = word.slice(0, word.length - rule.strip.length) + rule.add
        expand(form, rule.next, depth + 1)
      }
  }
  const dic = readFileSync(join(folder, 'index.dic'), 'utf8').split('\n').slice(1)
  for (const line of dic) {
    const [word = '', wordFlags] = line.split(/\s/)[0]?.split('/') ?? []
    if (!word || isProper(word) || /\d/.test(word)) continue
    expand(word, flags(wordFlags), 0)
  }
  return words
}

const [enFolder, frFolder] = process.argv.slice(2)
if (!enFolder || !frFolder)
  throw new Error('usage: node build-words.ts <english folder> <french folder>')
write('en.txt.gz', english(enFolder))
write('fr.txt.gz', french(frFolder))
