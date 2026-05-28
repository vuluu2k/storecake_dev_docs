#!/usr/bin/env node
// Sync authoring markdown từ root folders sang `website/docs/` (Docusaurus).
//
// - Source: `storecake-builder/`, `storecake-api/`, `webcake-api/` và một số
//   file root-level whitelist (`git-flow.md`, `setup.md`).
// - Target: `website/docs/<same-relative-path>`.
// - Body của target luôn được overwrite từ source.
// - Frontmatter target được PRESERVE (giữ custom `slug`, `description`, position
//   đã chỉnh tay). Field thiếu được auto-fill: `title` parse từ H1 đầu, hoặc
//   slugify filename; `sidebar_position` từ tiền tố `NN-` (README → 1, NN- → NN+1).
// - `_category_.json` copy nếu target chưa có; không overwrite.
// - File chỉ tồn tại trong target (vd `intro.md`) — bỏ qua.
//
// Usage:
//   node scripts/sync-docs.mjs                                 # sync mọi whitelisted dir
//   node scripts/sync-docs.mjs --dry                           # print plan, không ghi
//   node scripts/sync-docs.mjs --verbose                       # log mỗi file
//   node scripts/sync-docs.mjs storecake-builder/editor-v2     # scope: chỉ folder con này
//   node scripts/sync-docs.mjs storecake-builder/editor-v2/10-history.md  # scope: 1 file
//
// SAFETY: sync luôn overwrite body của target từ source. Frontmatter trong
// target được preserve. Nếu user đã chỉnh trực tiếp body trong `website/docs/`,
// sync sẽ ghi đè. Khi không chắc, chạy `--dry --verbose` trước; hoặc truyền
// đường dẫn cụ thể để giới hạn phạm vi (vd chỉ sync editor-v2 changes).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..')
const TARGET_ROOT = path.join(ROOT, 'website', 'docs')

const SYNC_DIRS = ['storecake-builder', 'storecake-api', 'webcake-api']
const SYNC_ROOT_FILES = ['git-flow.md', 'setup.md']

const rawArgs = process.argv.slice(2)
const flags = new Set(rawArgs.filter((a) => a.startsWith('-')))
const positional = rawArgs.filter((a) => !a.startsWith('-'))
const DRY = flags.has('--dry') || flags.has('-n')
const VERBOSE = flags.has('--verbose') || flags.has('-v')

// Path filter — nếu user truyền positional args, chỉ sync file/folder match prefix.
const SCOPES = positional.map((p) => p.replace(/\/$/, ''))
function inScope(relPath) {
  if (!SCOPES.length) return true
  return SCOPES.some((s) => relPath === s || relPath.startsWith(s + '/'))
}

const log = (...a) => VERBOSE && console.log(...a)
const info = (...a) => console.log(...a)

// ---------- frontmatter ----------

// Parse `---\n key: value \n---\n body`. Trả `{ data, body }`.
// Hỗ trợ scalar string / number / bool — đủ cho Docusaurus frontmatter.
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { data: null, body: raw }
  const data = {}
  for (const line of m[1].split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (!km) continue
    const key = km[1]
    let v = km[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    } else if (/^-?\d+(\.\d+)?$/.test(v)) {
      v = Number(v)
    } else if (v === 'true' || v === 'false') {
      v = v === 'true'
    }
    data[key] = v
  }
  return { data, body: m[2] }
}

function stringifyFrontmatter(data) {
  const lines = ['---']
  for (const k of Object.keys(data)) {
    const v = data[k]
    if (typeof v === 'string') {
      // Quote khi value chứa ký tự đặc biệt của YAML (`:`, `#`, dấu đầu dòng).
      const needsQuote = /[:#\n]/.test(v) || /^\s|\s$/.test(v) || /^[-?!&*|>%@`]/.test(v)
      lines.push(`${k}: ${needsQuote ? JSON.stringify(v) : v}`)
    } else {
      lines.push(`${k}: ${v}`)
    }
  }
  lines.push('---', '')
  return lines.join('\n')
}

// ---------- auto-derived metadata ----------

// Tìm H1 đầu tiên trong body Markdown — bỏ qua code fence.
function extractH1(body) {
  const lines = body.split(/\r?\n/)
  let inFence = false
  for (const line of lines) {
    if (/^```/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const m = line.match(/^#\s+(.+?)\s*$/)
    if (m) return m[1].trim()
  }
  return null
}

// Sidebar position default:
//   - `README.md`            → 1
//   - `NN-anything.md`       → NN + 1 (để README chiếm vị trí 1)
//   - khác                   → null (caller giữ giá trị target cũ, nếu không có thì skip)
function defaultSidebarPosition(filename) {
  if (filename.toLowerCase() === 'readme.md') return 1
  const m = filename.match(/^(\d+)-/)
  if (m) return Number(m[1]) + 1
  return null
}

// Title fallback từ filename khi không có H1: `01-foo-bar.md` → `01 — Foo Bar`.
function titleFromFilename(filename) {
  const stem = filename.replace(/\.md$/i, '')
  if (stem.toLowerCase() === 'readme') return 'Overview'
  const m = stem.match(/^(\d+)-(.+)$/)
  if (m) {
    const words = m[2].split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    return `${m[1]} — ${words}`
  }
  return stem.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ---------- file walking ----------

function* walkMd(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walkMd(full)
    else if (entry.isFile() && entry.name.endsWith('.md')) yield full
  }
}

function* walkCategoryFiles(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walkCategoryFiles(full)
    else if (entry.name === '_category_.json') yield full
  }
}

// ---------- sync one file ----------

function syncMarkdown(sourcePath, relPath) {
  const targetPath = path.join(TARGET_ROOT, relPath)
  const filename = path.basename(sourcePath)

  const sourceRaw = fs.readFileSync(sourcePath, 'utf8')
  const { data: sourceFm, body: sourceBody } = parseFrontmatter(sourceRaw)

  let targetFm = null
  let targetExists = fs.existsSync(targetPath)
  if (targetExists) {
    const targetRaw = fs.readFileSync(targetPath, 'utf8')
    targetFm = parseFrontmatter(targetRaw).data
  }

  // Merge frontmatter — target wins (preserve manual edits), then source, then auto.
  const fm = {}
  // Start with target keys to set order
  if (targetFm) for (const k of Object.keys(targetFm)) fm[k] = targetFm[k]
  if (sourceFm) {
    for (const k of Object.keys(sourceFm)) {
      if (!(k in fm)) fm[k] = sourceFm[k]
    }
  }

  // Auto title
  if (!fm.title) {
    const h1 = extractH1(sourceBody)
    fm.title = h1 || titleFromFilename(filename)
  }
  // Auto sidebar_position (chỉ áp dụng khi chưa có)
  if (fm.sidebar_position === undefined) {
    const pos = defaultSidebarPosition(filename)
    if (pos !== null) fm.sidebar_position = pos
  }

  // Đảm bảo thứ tự field "đẹp": slug, sidebar_position, title, description, others
  const PREFERRED = ['slug', 'sidebar_position', 'title', 'description']
  const ordered = {}
  for (const k of PREFERRED) if (k in fm) ordered[k] = fm[k]
  for (const k of Object.keys(fm)) if (!(k in ordered)) ordered[k] = fm[k]

  const out = stringifyFrontmatter(ordered) + '\n' + sourceBody.replace(/^\n+/, '')

  if (DRY) {
    info(`[plan] ${relPath}${targetExists ? '' : ' (new)'}`)
    return { changed: true, created: !targetExists }
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  const existing = targetExists ? fs.readFileSync(targetPath, 'utf8') : null
  if (existing === out) {
    log(`  unchanged: ${relPath}`)
    return { changed: false, created: false }
  }
  fs.writeFileSync(targetPath, out, 'utf8')
  log(`  ${targetExists ? 'updated' : 'created'}: ${relPath}`)
  return { changed: true, created: !targetExists }
}

function syncCategory(sourcePath, relPath) {
  const targetPath = path.join(TARGET_ROOT, relPath)
  if (fs.existsSync(targetPath)) {
    log(`  category exists, skip: ${relPath}`)
    return { changed: false, created: false }
  }
  if (DRY) {
    info(`[plan] ${relPath} (new category)`)
    return { changed: true, created: true }
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(sourcePath, targetPath)
  log(`  category copied: ${relPath}`)
  return { changed: true, created: true }
}

// ---------- main ----------

function sync() {
  const stats = { md: 0, created: 0, updated: 0, unchanged: 0, category: 0 }

  // Whitelisted directories
  for (const dir of SYNC_DIRS) {
    const sourceDir = path.join(ROOT, dir)
    if (!fs.existsSync(sourceDir)) continue
    for (const src of walkMd(sourceDir)) {
      const rel = path.relative(ROOT, src)
      if (!inScope(rel)) continue
      const r = syncMarkdown(src, rel)
      stats.md++
      if (r.changed) (r.created ? stats.created++ : stats.updated++)
      else stats.unchanged++
    }
    for (const src of walkCategoryFiles(sourceDir)) {
      const rel = path.relative(ROOT, src)
      if (!inScope(rel)) continue
      const r = syncCategory(src, rel)
      if (r.changed) stats.category++
    }
  }

  // Root-level whitelisted files (sync chỉ khi target đã tồn tại — tránh đẩy
  // legacy GitBook files chưa được "promote" vào website).
  for (const f of SYNC_ROOT_FILES) {
    if (!inScope(f)) continue
    const src = path.join(ROOT, f)
    if (!fs.existsSync(src)) continue
    const target = path.join(TARGET_ROOT, f)
    if (!fs.existsSync(target)) {
      log(`  skip root file (not in website yet): ${f}`)
      continue
    }
    const r = syncMarkdown(src, f)
    stats.md++
    if (r.changed) (r.created ? stats.created++ : stats.updated++)
    else stats.unchanged++
  }

  if (SCOPES.length) info(`  scoped to: ${SCOPES.join(', ')}`)

  const head = DRY ? '[DRY RUN] ' : ''
  info(`${head}done — md scanned: ${stats.md}, created: ${stats.created}, updated: ${stats.updated}, unchanged: ${stats.unchanged}, new categories: ${stats.category}`)
}

sync()
