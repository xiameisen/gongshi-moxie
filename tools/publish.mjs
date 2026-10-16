/**
 * 发布脚本：通过 GitHub Git Data API 把本地工作树推成真实提交，并开启 GitHub Pages。
 *
 * 为什么要这么绕：本机到 github.com:443 的连接被阻断，git 的 smart-HTTP 传输不可用，
 * 但 api.github.com 可达（gh CLI 正是走它）。于是改用 REST API：
 *   blob → tree → commit → ref
 * 注意：全新空仓库不允许直接建 blob（会返回 409 Git Repository is empty），
 * 因此先用 Contents API 落一个 .gitignore 作为根提交，再在其上提交全部内容。
 *
 * 用法：
 *   GH_TOKEN=xxx node tools/publish.mjs <owner>/<repo> [branch]
 *   GH_MESSAGE_FILE=.tmp/msg.txt   自定义提交信息
 *   PAGES=1 PAGES_PATH=/docs       发布后开启 Pages
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) { console.error('缺少 GH_TOKEN 环境变量'); process.exit(1); }

const argv = process.argv.slice(2);
const slug = argv[0] || `${process.env.GH_OWNER || ''}/${process.env.GH_REPO || ''}`;
const [OWNER, REPO] = slug.split('/');
if (!OWNER || !REPO) { console.error('用法: node tools/publish.mjs <owner>/<repo> [branch]'); process.exit(1); }
const BRANCH = argv[1] || process.env.GH_BRANCH || 'main';

const MESSAGE = process.env.GH_MESSAGE_FILE
  ? fs.readFileSync(process.env.GH_MESSAGE_FILE, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '')
  : (process.env.GH_MESSAGE || 'chore: 发布');

const API = 'https://api.github.com';
const enc = (s) => encodeURIComponent(s);

async function api(method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kaoyan-math-publisher',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) { const e = new Error(`${method} ${url} -> ${res.status}\n${text.slice(0, 600)}`); e.status = res.status; throw e; }
  return text ? JSON.parse(text) : null;
}

/* ---------- 1. 收集要发布的文件（与 .gitignore 保持一致） ---------- */
const IGNORE_DIRS = new Set(['node_modules', '.npm-cache', '.tmp', '.git']);
const IGNORE_FILE = /(^|\/)\.DS_Store$|\.log$/;

function walk(dir, rel, out) {
  for (const name of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    const r = rel ? rel + '/' + name : name;
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      if (IGNORE_DIRS.has(name)) continue;
      walk(abs, r, out);
    } else if (st.isFile()) {
      if (IGNORE_FILE.test(r)) continue;
      out.push({ path: r, abs, size: st.size });
    }
  }
  return out;
}

const files = walk(ROOT, '', []);
console.log(`待发布 ${files.length} 个文件，合计 ${(files.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(2)} MB`);

/* ---------- 2. 仓库若为空，先用 Contents API 打底根提交 ---------- */
let parentSha = null;
try {
  const ref = await api('GET', `/repos/${enc(OWNER)}/${enc(REPO)}/git/ref/heads/${BRANCH}`);
  parentSha = ref.object.sha;
  console.log(`分支 ${BRANCH} 已存在，父提交 ${parentSha.slice(0, 10)}`);
} catch (e) {
  // 空仓库：读取 ref 会返回 404（无该 ref）或 409（Git Repository is empty），两者都表示需要打底
  if (e.status !== 404 && e.status !== 409) throw e;
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  const boot = await api('PUT', `/repos/${enc(OWNER)}/${enc(REPO)}/contents/.gitignore`, {
    message: 'chore: 初始化仓库（.gitignore）',
    content: Buffer.from(gi, 'utf8').toString('base64'),
    branch: BRANCH,
  });
  parentSha = boot.commit.sha;
  console.log(`空仓库：已用 Contents API 建立根提交 ${parentSha.slice(0, 10)}`);
}

/* ---------- 3. 逐文件建 blob ---------- */
const entries = [];
let i = 0;
for (const f of files) {
  i++;
  const content = fs.readFileSync(f.abs).toString('base64');
  const blob = await api('POST', `/repos/${enc(OWNER)}/${enc(REPO)}/git/blobs`, { content, encoding: 'base64' });
  entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  process.stdout.write(`\r  上传 blob ${i}/${files.length}  ${f.path.slice(0, 44).padEnd(44)}`);
}
process.stdout.write('\n');

/* ---------- 4. 建 tree 与 commit ---------- */
const tree = await api('POST', `/repos/${enc(OWNER)}/${enc(REPO)}/git/trees`, { tree: entries });
const commit = await api('POST', `/repos/${enc(OWNER)}/${enc(REPO)}/git/commits`, {
  message: MESSAGE, tree: tree.sha, parents: [parentSha],
});
await api('PATCH', `/repos/${enc(OWNER)}/${enc(REPO)}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false });
console.log(`  tree   ${tree.sha}`);
console.log(`  commit ${commit.sha}`);

/* ---------- 5. 开启 GitHub Pages ---------- */
const pagesPath = process.env.PAGES_PATH || '/docs';
if (process.env.PAGES === '1') {
  let pages;
  try {
    pages = await api('POST', `/repos/${enc(OWNER)}/${enc(REPO)}/pages`, {
      source: { branch: BRANCH, path: pagesPath },
    });
  } catch (e) {
    if (e.status === 409) {
      pages = await api('PUT', `/repos/${enc(OWNER)}/${enc(REPO)}/pages`, {
        source: { branch: BRANCH, path: pagesPath },
      });
    } else if (e.status === 422) {
      pages = await api('PUT', `/repos/${enc(OWNER)}/${enc(REPO)}/pages`, {
        source: { branch: BRANCH, path: pagesPath },
      });
    } else throw e;
  }
  console.log(`  Pages  已配置：${pages.source.branch} ${pages.source.path}`);
  console.log(`  首次发布后需要 1–2 分钟构建，网址：${pages.html_url || ''}`);
}

console.log(`\n✓ 已发布到 ${OWNER}/${REPO}（${BRANCH}）`);
console.log(`  仓库  https://github.com/${OWNER}/${REPO}`);
console.log(`  提交  https://github.com/${OWNER}/${REPO}/commit/${commit.sha}`);
