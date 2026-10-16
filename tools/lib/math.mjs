/**
 * MathJax 构建期渲染封装。
 * 产物与原始文件所用的 MathJax 配置一致（TeX 字体 / SVG 输出 / 全局字形缓存），
 * 因此单条公式的 SVG 与原文件逐字节相同。
 * 关键：按 (display, tex) 去重，$x$ 这类高频公式只渲染一次。
 */
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

export function createRenderer() {
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({ packages: AllPackages });
  const svg = new SVG({ fontCache: 'global' });
  const doc = mathjax.document('', { InputJax: tex, OutputJax: svg });

  const cache = new Map();
  let hits = 0, miss = 0;

  return {
    /** 渲染一条公式，返回 <svg>…</svg> 字符串 */
    render(texString, display = false) {
      const key = (display ? 'D\u0000' : 'I\u0000') + texString;
      const got = cache.get(key);
      if (got !== undefined) { hits++; return got; }
      miss++;
      const node = doc.convert(texString, {
        display, em: 16, ex: 8, containerWidth: 80 * 16,
      });
      const out = adaptor.innerHTML(node);
      cache.set(key, out);
      return out;
    },
    /** 全部渲染完成后调用：返回全局字形缓存 <svg id="MJX-SVG-global-cache">…</svg> */
    globalCache() {
      const defs = adaptor.outerHTML(svg.fontCache.getCache());
      return '<svg id="MJX-SVG-global-cache" aria-hidden="true" width="0" height="0" '
        + 'style="position:absolute;width:0;height:0;overflow:hidden">' + defs + '</svg>';
    },
    stats() {
      return { unique: cache.size, hits, miss, glyphBytes: this.globalCache().length };
    },
  };
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

const latexSpan = (tex) => '<span class="latex-src" hidden>' + escapeHtml(tex) + '</span>';

/** 行内公式包装（与原文件结构一致，便于复用原样式与检索行为） */
export function inlineMath(tex, svgStr) {
  return '<span class="m">' + svgStr + latexSpan(tex) + '</span>';
}

/** 块级公式包装 */
export function blockMath(tex, svgStr) {
  return svgStr + latexSpan(tex);
}

/**
 * 把 HTML 片段中的 $…$（行内）与 $$…$$（块级）替换为渲染后的 SVG。
 * 扫描式替换，避免正则对 $ 边界与转义的误判。
 */
export function substituteMath(html, renderer) {
  let out = '';
  let i = 0;
  while (i < html.length) {
    if (html[i] === '$') {
      if (html[i + 1] === '$') {
        const end = html.indexOf('$$', i + 2);
        if (end !== -1) {
          const tex = html.slice(i + 2, end);
          out += blockMath(tex, renderer.render(tex, true));
          i = end + 2;
          continue;
        }
      } else {
        const end = html.indexOf('$', i + 1);
        if (end !== -1) {
          const tex = html.slice(i + 1, end);
          out += inlineMath(tex, renderer.render(tex, false));
          i = end + 1;
          continue;
        }
      }
    }
    out += html[i];
    i++;
  }
  return out;
}
