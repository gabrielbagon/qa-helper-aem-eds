/**
 * QA Helper — AEM EDS/Franklin
 * Ferramenta de auditoria visual e responsiva para preview e localhost.
 *
 * USO:
 *   1. Cole no console do browser na página AEM EDS.
 *   2. Ou converta em bookmarklet (veja documentação).
 *   3. Ou adicione via Tampermonkey.
 *
 * FEATURES:
 *   - Comparação visual de componentes (screenshot vs renderizado)
 *   - Auditoria de links e alt-text
 *   - Análise responsiva por breakpoint
 *   - Destaque visual de problemas na página
 */
(() => {
  'use strict';

  // Evitar dupla injeção
  if (window.__qaHelperActive) {
    console.warn('[QA Helper] Já está ativo. Use o painel existente.');
    return;
  }
  window.__qaHelperActive = true;

  // ─── CONSTANTES ──────────────────────────────────────────────────────────────
  const BREAKPOINTS = {
    mobile: { label: 'Mobile', width: 375, height: 812 },
    tablet: { label: 'Tablet', width: 768, height: 1024 },
    desktop: { label: 'Desktop', width: 1440, height: 900 },
  };

  const COLORS = {
    error: '#ef4444',
    warning: '#f59e0b',
    success: '#22c55e',
    info: '#3b82f6',
    highlight: 'rgba(239, 68, 68, 0.25)',
    highlightBorder: '#ef4444',
    overlayBg: 'rgba(0, 0, 0, 0.03)',
  };

  // ─── UTILITÁRIOS ────────────────────────────────────────────────────────────
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  function createEl(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else if (k === 'className') {
        el.className = v;
      } else if (k.startsWith('on')) {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else {
        el.setAttribute(k, v);
      }
    });
    children.forEach((c) => {
      if (typeof c === 'string') el.appendChild(document.createTextNode(c));
      else if (c) el.appendChild(c);
    });
    return el;
  }

  // Gera ID único curto
  const uid = () => `qa${Math.random().toString(36).slice(2, 8)}`;

  // ─── HIGHLIGHT ENGINE ───────────────────────────────────────────────────────
  // Gerencia overlays de destaque sobre elementos problemáticos
  const highlights = [];

  function highlightElement(el, message, severity = 'error') {
    const rect = el.getBoundingClientRect();
    const overlay = createEl('div', {
      style: {
        position: 'fixed',
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        background: severity === 'error' ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)',
        border: `2px solid ${severity === 'error' ? COLORS.error : COLORS.warning}`,
        pointerEvents: 'none',
        zIndex: '2147483640',
        borderRadius: '3px',
        transition: 'all 0.2s',
      },
    });

    const badge = createEl(
      'div',
      {
        style: {
          position: 'absolute',
          top: '-24px',
          left: '0',
          background: severity === 'error' ? COLORS.error : COLORS.warning,
          color: '#fff',
          fontSize: '11px',
          padding: '2px 8px',
          borderRadius: '3px',
          whiteSpace: 'nowrap',
          fontFamily: 'system-ui, sans-serif',
          maxWidth: '350px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        },
      },
      [message],
    );

    overlay.appendChild(badge);
    document.body.appendChild(overlay);
    highlights.push(overlay);
    return overlay;
  }

  function clearHighlights() {
    highlights.forEach((h) => h.remove());
    highlights.length = 0;
  }

  // Atualiza posição dos highlights ao rolar
  function refreshHighlightsPosition() {
    // Os overlays usam position: fixed, então se movem com o scroll automaticamente
    // Mas os rects mudam — melhor limpar e re-executar a auditoria ativa
  }

  // ─── MODULE 1: LINK & A11Y AUDITOR ──────────────────────────────────────────
  const linkAuditor = {
    async run() {
      clearHighlights();
      const results = { links: [], brokenLinks: [], imagesNoAlt: [], issues: [] };

      // Coletar todos os links
      const anchors = $$('a[href]');
      for (const a of anchors) {
        const href = a.getAttribute('href');
        const text = a.textContent.trim() || a.getAttribute('aria-label') || '[sem texto]';
        const linkInfo = { el: a, href, text, status: 'ok' };

        // Links vazios ou hash-only puro
        if (!href || href === '#' || href === 'javascript:void(0)') {
          linkInfo.status = 'empty';
          results.issues.push({
            el: a,
            type: 'warning',
            msg: `Link vazio ou placeholder: "${text}"`,
          });
        }
        // [BUG-1 FIX] Âncoras internas (#section, #faq, etc.)
        else if (href.startsWith('#')) {
          linkInfo.status = 'anchor';
          const targetId = href.slice(1);
          if (targetId && !document.getElementById(targetId)) {
            results.issues.push({
              el: a,
              type: 'warning',
              msg: `Âncora "#${targetId}" aponta para ID inexistente na página`,
            });
          }
        }
        // [BUG-2 FIX] mailto:, tel:, sms:, data:, blob:, ftp:
        else if (/^(mailto|tel|sms|data|blob|ftp):/.test(href)) {
          linkInfo.status = 'special';
        }
        // Links internos — tentar validar
        else if (href.startsWith('/') || href.startsWith(window.location.origin)) {
          try {
            const url = new URL(href, window.location.origin);
            // [BUG-5 FIX] Sem mode:"no-cors" — same-origin retorna status real
            const resp = await fetch(url.href, { method: 'HEAD' });
            if (resp.status >= 400) {
              linkInfo.status = 'broken';
              results.brokenLinks.push(linkInfo);
              results.issues.push({
                el: a,
                type: 'error',
                msg: `Link quebrado (${resp.status}): ${href}`,
              });
            }
          } catch {
            linkInfo.status = 'unreachable';
            results.issues.push({
              el: a,
              type: 'warning',
              msg: `Link inacessível: ${href}`,
            });
          }
        }
        // Links externos — marcar como externo (CORS impede HEAD)
        else if (href.startsWith('http')) {
          linkInfo.status = 'external';
        }
        // [BUG-1/2 FIX] Fallback para formatos desconhecidos
        else {
          linkInfo.status = 'unknown';
        }

        results.links.push(linkInfo);
      }

      // Imagens sem alt
      const images = $$('img');
      images.forEach((img) => {
        const alt = img.getAttribute('alt');
        if (alt === null || alt.trim() === '') {
          results.imagesNoAlt.push(img);
          results.issues.push({
            el: img,
            type: 'error',
            msg: `Imagem sem alt: ${img.src.split('/').pop() || '[inline]'}`,
          });
        }
      });

      // Highlight issues on page
      results.issues.forEach((issue) => {
        highlightElement(issue.el, issue.msg, issue.type);
      });

      return results;
    },
  };

  // ─── MODULE 2: RESPONSIVE ANALYZER ──────────────────────────────────────────

  // [BUG-4 FIX] Verifica se um ancestor com overflow:hidden clippa o elemento
  function isClippedByAncestor(el) {
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const style = getComputedStyle(parent);
      if (
        style.overflow === 'hidden' ||
        style.overflowX === 'hidden' ||
        style.overflow === 'clip'
      ) {
        const parentRect = parent.getBoundingClientRect();
        if (parentRect.right <= window.innerWidth + 2) {
          return true;
        }
      }
      parent = parent.parentElement;
    }
    return false;
  }

  const responsiveAnalyzer = {
    analyzeCurrentViewport() {
      clearHighlights();
      const issues = [];
      const viewportWidth = window.innerWidth;

      // 1. Overflow horizontal
      const allEls = $$('body *');
      allEls.forEach((el) => {
        // Ignorar elementos do QA Helper
        if (el.closest('#qa-helper-root')) return;
        // Ignorar elementos escondidos
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;

        const rect = el.getBoundingClientRect();

        // Overflow — elemento extende além da viewport
        // [BUG-4 FIX] Ignora se ancestor tem overflow:hidden
        if (rect.right > viewportWidth + 2 && !isClippedByAncestor(el)) {
          issues.push({
            el,
            type: 'error',
            category: 'overflow',
            msg: `Overflow horizontal: +${Math.round(rect.right - viewportWidth)}px além da viewport`,
            severity: 'error',
          });
        }

        // Largura zero em container que deveria ter conteúdo
        if (
          rect.width === 0 &&
          el.children.length > 0 &&
          !['SCRIPT', 'STYLE', 'META', 'LINK', 'BR', 'HR'].includes(el.tagName)
        ) {
          issues.push({
            el,
            type: 'warning',
            category: 'collapsed',
            msg: 'Container com largura 0 mas com filhos',
            severity: 'warning',
          });
        }
      });

      // 2. Elementos sobrepostos (heurística: blocos AEM EDS de mesmo nível)
      const blocks = $$('.section > div[class], .section > .block');
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          const a = blocks[i].getBoundingClientRect();
          const b = blocks[j].getBoundingClientRect();
          const overlapY = !(a.bottom <= b.top || b.bottom <= a.top);
          const overlapX = !(a.right <= b.left || b.right <= a.left);
          if (overlapX && overlapY && a.height > 0 && b.height > 0) {
            issues.push({
              el: blocks[j],
              type: 'warning',
              category: 'overlap',
              msg: `Possível sobreposição entre blocos: .${blocks[i].className.split(' ')[0]} e .${blocks[j].className.split(' ')[0]}`,
              severity: 'warning',
            });
          }
        }
      }

      // 3. Textos com quebras estranhas (heurística)
      // Procura por headings e parágrafos onde a altura é muito maior que o esperado
      const textEls = $$('h1, h2, h3, h4, h5, h6, p, .button-container a');
      textEls.forEach((el) => {
        if (el.closest('#qa-helper-root')) return;
        const style = getComputedStyle(el);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
        const height = el.getBoundingClientRect().height;
        const lines = Math.round(height / lineHeight);

        // Heading com muitas linhas pode indicar quebra estranha
        if (el.tagName.match(/^H[1-3]$/) && lines > 3) {
          issues.push({
            el,
            type: 'warning',
            category: 'text-wrap',
            msg: `Heading com ${lines} linhas — possível quebra estranha`,
            severity: 'warning',
          });
        }
      });

      // 4. Imagens distorcidas
      $$('img').forEach((img) => {
        if (img.closest('#qa-helper-root')) return;
        if (img.naturalWidth && img.naturalHeight) {
          const naturalRatio = img.naturalWidth / img.naturalHeight;
          const displayRatio = img.width / img.height;
          if (Math.abs(naturalRatio - displayRatio) > 0.1 && img.width > 50) {
            issues.push({
              el: img,
              type: 'warning',
              category: 'distortion',
              msg: `Imagem possivelmente distorcida (ratio natural: ${naturalRatio.toFixed(2)}, exibido: ${displayRatio.toFixed(2)})`,
              severity: 'warning',
            });
          }
        }
      });

      // 5. Body overflow check
      if (document.body.scrollWidth > viewportWidth) {
        issues.unshift({
          el: document.body,
          type: 'error',
          category: 'body-overflow',
          msg: `Body com scroll horizontal: ${document.body.scrollWidth}px (viewport: ${viewportWidth}px)`,
          severity: 'error',
        });
      }

      // Highlight
      issues.forEach((issue) => {
        highlightElement(issue.el, issue.msg, issue.severity);
      });

      return {
        viewportWidth,
        breakpoint:
          viewportWidth <= 480
            ? 'mobile'
            : viewportWidth <= 1024
              ? 'tablet'
              : 'desktop',
        issues,
      };
    },

    // Análise multi-breakpoint via iframe
    async analyzeAllBreakpoints(onProgress) {
      const allIssues = {};

      for (const [bp, config] of Object.entries(BREAKPOINTS)) {
        if (onProgress) onProgress(`Analisando ${config.label} (${config.width}px)...`);

        const issues = await this.analyzeViaIframe(config.width, config.height);
        allIssues[bp] = { ...config, issues };
      }

      return allIssues;
    },

    analyzeViaIframe(width, height) {
      return new Promise((resolve) => {
        const iframe = createEl('iframe', {
          style: {
            position: 'fixed',
            top: '-9999px',
            left: '-9999px',
            width: `${width}px`,
            height: `${height}px`,
            border: 'none',
            opacity: '0',
            pointerEvents: 'none',
            zIndex: '-1',
          },
        });

        iframe.src = window.location.href;
        document.body.appendChild(iframe);

        iframe.addEventListener('load', () => {
          const issues = [];
          try {
            const doc = iframe.contentDocument;
            const body = doc.body;

            // Body overflow
            if (body.scrollWidth > width) {
              issues.push({
                category: 'body-overflow',
                severity: 'error',
                msg: `Body overflow: ${body.scrollWidth}px (viewport: ${width}px)`,
                selector: 'body',
              });
            }

            // Elementos com overflow
            const allEls = [...doc.querySelectorAll('body *')];
            allEls.forEach((el) => {
              const rect = el.getBoundingClientRect();
              const tag = el.tagName.toLowerCase();
              const cls = el.className
                ? `.${el.className.toString().split(' ').filter(Boolean).join('.')}`
                : '';

              if (rect.right > width + 2 && rect.width > 0) {
                issues.push({
                  category: 'overflow',
                  severity: 'error',
                  msg: `${tag}${cls} — overflow +${Math.round(rect.right - width)}px`,
                  selector: `${tag}${cls}`,
                });
              }
            });

            // Blocos sobrepostos
            const blocks = [...doc.querySelectorAll('.section > div[class], .section > .block')];
            for (let i = 0; i < blocks.length; i++) {
              for (let j = i + 1; j < blocks.length; j++) {
                const a = blocks[i].getBoundingClientRect();
                const b = blocks[j].getBoundingClientRect();
                const overlapY = !(a.bottom <= b.top || b.bottom <= a.top);
                const overlapX = !(a.right <= b.left || b.right <= a.left);
                if (overlapX && overlapY && a.height > 5 && b.height > 5) {
                  issues.push({
                    category: 'overlap',
                    severity: 'warning',
                    msg: `Sobreposição entre .${blocks[i].className.split(' ')[0]} e .${blocks[j].className.split(' ')[0]}`,
                    selector: blocks[j].className,
                  });
                }
              }
            }
          } catch (e) {
            issues.push({
              category: 'error',
              severity: 'warning',
              msg: `Não foi possível analisar iframe: ${e.message}`,
              selector: 'iframe',
            });
          }

          iframe.remove();
          resolve(issues);
        });

        // Timeout safety
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.remove();
            resolve([
              {
                category: 'timeout',
                severity: 'warning',
                msg: 'Timeout ao carregar iframe para análise',
                selector: 'iframe',
              },
            ]);
          }
        }, 10000);
      });
    },
  };

  // ─── MODULE 3: VISUAL COMPARATOR ────────────────────────────────────────────
  const visualComparator = {
    html2canvasLoaded: false,

    async loadHtml2Canvas() {
      if (this.html2canvasLoaded) return true;
      if (window.html2canvas) {
        this.html2canvasLoaded = true;
        return true;
      }

      return new Promise((resolve) => {
        const script = createEl('script', {
          src: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        });
        script.onload = () => {
          this.html2canvasLoaded = true;
          resolve(true);
        };
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
      });
    },

    async captureElement(el) {
      const loaded = await this.loadHtml2Canvas();
      if (!loaded) throw new Error('html2canvas não pôde ser carregado. Verifique a conexão.');

      return window.html2canvas(el, {
        useCORS: true,
        allowTaint: true,
        scale: 1,
        backgroundColor: null,
        logging: false,
      });
    },

    // Compara screenshot de referência com captura do elemento
    diffCanvases(refCanvas, capturedCanvas) {
      const w = Math.max(refCanvas.width, capturedCanvas.width);
      const h = Math.max(refCanvas.height, capturedCanvas.height);

      const diffCanvas = createEl('canvas');
      diffCanvas.width = w;
      diffCanvas.height = h;
      const ctx = diffCanvas.getContext('2d');

      // Pegar pixels das duas imagens
      const refCtx = document.createElement('canvas');
      refCtx.width = w;
      refCtx.height = h;
      const refC = refCtx.getContext('2d');
      refC.drawImage(refCanvas, 0, 0);
      const refData = refC.getImageData(0, 0, w, h);

      const capCtx = document.createElement('canvas');
      capCtx.width = w;
      capCtx.height = h;
      const capC = capCtx.getContext('2d');
      capC.drawImage(capturedCanvas, 0, 0);
      const capData = capC.getImageData(0, 0, w, h);

      const diffData = ctx.createImageData(w, h);
      let diffPixels = 0;
      const totalPixels = w * h;
      const threshold = 30; // tolerância RGB

      for (let i = 0; i < refData.data.length; i += 4) {
        const dr = Math.abs(refData.data[i] - capData.data[i]);
        const dg = Math.abs(refData.data[i + 1] - capData.data[i + 1]);
        const db = Math.abs(refData.data[i + 2] - capData.data[i + 2]);

        if (dr > threshold || dg > threshold || db > threshold) {
          // Pixel diferente — pintar de vermelho
          diffData.data[i] = 255;
          diffData.data[i + 1] = 50;
          diffData.data[i + 2] = 50;
          diffData.data[i + 3] = 180;
          diffPixels++;
        } else {
          // Pixel igual — copiar original com opacidade reduzida
          diffData.data[i] = capData.data[i];
          diffData.data[i + 1] = capData.data[i + 1];
          diffData.data[i + 2] = capData.data[i + 2];
          diffData.data[i + 3] = 80;
        }
      }

      ctx.putImageData(diffData, 0, 0);

      return {
        canvas: diffCanvas,
        diffPercent: ((diffPixels / totalPixels) * 100).toFixed(2),
        diffPixels,
        totalPixels,
        dimensions: { ref: { w: refCanvas.width, h: refCanvas.height }, cap: { w: capturedCanvas.width, h: capturedCanvas.height } },
      };
    },

    // Permite selecionar um elemento na página
    startPicker(onPick) {
      let hoverOverlay = null;
      const cleanup = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey);
        if (hoverOverlay) hoverOverlay.remove();
        document.body.style.cursor = '';
      };

      const onMove = (e) => {
        const el = e.target;
        if (el.closest('#qa-helper-root')) return;
        if (!hoverOverlay) {
          hoverOverlay = createEl('div', {
            style: {
              position: 'fixed',
              pointerEvents: 'none',
              zIndex: '2147483645',
              border: '2px dashed #3b82f6',
              background: 'rgba(59,130,246,0.1)',
              borderRadius: '3px',
              transition: 'all 0.1s ease',
            },
          });
          document.body.appendChild(hoverOverlay);
        }
        const rect = el.getBoundingClientRect();
        Object.assign(hoverOverlay.style, {
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        });
      };

      const onClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const el = e.target;
        if (el.closest('#qa-helper-root')) return;

        // Tentar pegar o bloco AEM mais próximo
        const block = el.closest('.block') || el.closest('.section > div') || el;
        cleanup();
        onPick(block);
      };

      const onKey = (e) => {
        if (e.key === 'Escape') cleanup();
      };

      document.body.style.cursor = 'crosshair';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey);

      return cleanup;
    },
  };

  // ─── MODULE 4: AEM EDS INSPECTOR ────────────────────────────────────────────
  const edsInspector = {
    getBlocks() {
      return $$('.block, [class*="-wrapper"] > div').map((el) => {
        const classes = [...el.classList];
        const name = classes.find((c) => c !== 'block' && c !== 'wrapper') || classes[0] || 'unknown';
        const rect = el.getBoundingClientRect();
        return {
          el,
          name,
          classes,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          children: el.children.length,
        };
      });
    },

    getSections() {
      return $$('.section').map((el, i) => ({
        el,
        index: i,
        classes: [...el.classList],
        blocks: el.querySelectorAll('.block').length,
        height: el.getBoundingClientRect().height,
      }));
    },

    getMetadata() {
      const meta = {};
      $$('head meta').forEach((m) => {
        const name = m.getAttribute('name') || m.getAttribute('property');
        if (name) meta[name] = m.getAttribute('content');
      });
      return meta;
    },
  };

  // ─── MODULE 5: FIGMA DESIGN COMPARATOR ────────────────────────────────────
  const figmaAnalyzer = {
    token: null,
    cache: {},

    // ── URL Parser ──────────────────────────────────────────────────────────
    parseUrl(url) {
      // Suporta formatos:
      //   https://www.figma.com/design/KEY/Name?node-id=1-2
      //   https://www.figma.com/file/KEY/Name?node-id=1%3A2
      //   https://www.figma.com/file/KEY/Name
      //   https://www.figma.com/proto/KEY/Name?node-id=1-2
      const match = url.match(
        /figma\.com\/(?:design|file|proto)\/([a-zA-Z0-9]+)(?:\/[^?]*)?(?:\?.*node-id=([^&]+))?/,
      );
      if (!match) return null;
      const fileKey = match[1];
      let nodeId = match[2] || null;
      if (nodeId) {
        nodeId = decodeURIComponent(nodeId).replace('-', ':');
      }
      return { fileKey, nodeId };
    },

    // ── API Client ──────────────────────────────────────────────────────────
    // Se rodando como extensão Chrome, usa o background proxy (sem CORS).
    // Se rodando como script injetável, tenta fetch direto (pode dar CORS).
    async apiFetch(endpoint) {
      if (!this.token) throw new Error('Token Figma não configurado');

      // Extensão Chrome: proxy via background service worker
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const result = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { action: 'figmaApi', endpoint, token: this.token },
            resolve,
          );
        });
        if (!result.success) throw new Error(result.error);
        return result.data;
      }

      // Fallback: fetch direto (pode falhar por CORS)
      const resp = await fetch(`https://api.figma.com/v1${endpoint}`, {
        headers: { 'X-Figma-Token': this.token },
      });
      if (!resp.ok) {
        if (resp.status === 403) throw new Error('Token inválido ou sem permissão para este arquivo');
        if (resp.status === 404) throw new Error('Arquivo ou node não encontrado no Figma');
        throw new Error(`Figma API erro ${resp.status}: ${resp.statusText}`);
      }
      return resp.json();
    },

    async fetchNode(fileKey, nodeId) {
      const cacheKey = `${fileKey}:${nodeId || 'root'}`;
      if (this.cache[cacheKey]) return this.cache[cacheKey];

      let data;
      if (nodeId) {
        data = await this.apiFetch(`/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`);
        const nodeData = data.nodes?.[nodeId]?.document;
        if (!nodeData) throw new Error(`Node ${nodeId} não encontrado no arquivo`);
        this.cache[cacheKey] = nodeData;
        return nodeData;
      }
      data = await this.apiFetch(`/files/${fileKey}`);
      this.cache[cacheKey] = data.document;
      return data.document;
    },

    async fetchImage(fileKey, nodeId, scale = 2) {
      const data = await this.apiFetch(
        `/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${scale}`,
      );
      return data.images?.[nodeId] || null;
    },

    // ── Figma Color → CSS ───────────────────────────────────────────────────
    figmaColorToCSS(c) {
      if (!c) return null;
      const r = Math.round(c.r * 255);
      const g = Math.round(c.g * 255);
      const b = Math.round(c.b * 255);
      const a = c.a !== undefined ? c.a : 1;
      return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})` : `rgb(${r}, ${g}, ${b})`;
    },

    figmaColorToRGB(c) {
      if (!c) return null;
      return { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) };
    },

    parseCSSColor(str) {
      if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') return null;
      const m = str.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
      if (m) return { r: +m[1], g: +m[2], b: +m[3] };
      return null;
    },

    colorDistance(a, b) {
      if (!a || !b) return 999;
      return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
    },

    // ── Figma Layout Mode → CSS ─────────────────────────────────────────────
    figmaAlignToCSS(axis, mode) {
      const map = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between' };
      return map[mode] || mode;
    },

    // ── Design Token Extractor (Figma Node) ─────────────────────────────────
    extractFigmaTokens(node) {
      const tokens = {
        name: node.name || 'unnamed',
        type: node.type,
        dimensions: null,
        spacing: null,
        typography: null,
        colors: null,
        borders: null,
        layout: null,
        children: [],
      };

      // Dimensões
      if (node.absoluteBoundingBox) {
        const bb = node.absoluteBoundingBox;
        tokens.dimensions = { width: bb.width, height: bb.height };
      } else if (node.size) {
        tokens.dimensions = { width: node.size.x, height: node.size.y };
      }

      // Espaçamento (auto-layout)
      if (node.paddingLeft !== undefined) {
        tokens.spacing = {
          paddingTop: node.paddingTop || 0,
          paddingRight: node.paddingRight || 0,
          paddingBottom: node.paddingBottom || 0,
          paddingLeft: node.paddingLeft || 0,
          gap: node.itemSpacing || 0,
          counterGap: node.counterAxisSpacing || 0,
        };
      }

      // Tipografia
      if (node.type === 'TEXT' && node.style) {
        const s = node.style;
        tokens.typography = {
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          lineHeight: s.lineHeightPx || null,
          letterSpacing: s.letterSpacing || 0,
          textAlign: (s.textAlignHorizontal || 'LEFT').toLowerCase(),
          color: node.fills?.length ? this.figmaColorToRGB(node.fills[0].color) : null,
        };
      }

      // Cores (fills e strokes)
      const solidFills = (node.fills || []).filter((f) => f.type === 'SOLID' && f.visible !== false);
      const solidStrokes = (node.strokes || []).filter((f) => f.type === 'SOLID' && f.visible !== false);
      tokens.colors = {
        background: solidFills.length ? this.figmaColorToRGB(solidFills[0].color) : null,
        borderColor: solidStrokes.length ? this.figmaColorToRGB(solidStrokes[0].color) : null,
      };

      // Bordas
      tokens.borders = {
        width: node.strokeWeight || 0,
        radius: node.cornerRadius || 0,
        topLeft: node.rectangleCornerRadii?.[0] || node.cornerRadius || 0,
        topRight: node.rectangleCornerRadii?.[1] || node.cornerRadius || 0,
        bottomRight: node.rectangleCornerRadii?.[2] || node.cornerRadius || 0,
        bottomLeft: node.rectangleCornerRadii?.[3] || node.cornerRadius || 0,
      };

      // Layout (auto-layout → flex)
      if (node.layoutMode && node.layoutMode !== 'NONE') {
        tokens.layout = {
          direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
          justifyContent: this.figmaAlignToCSS('primary', node.primaryAxisAlignItems),
          alignItems: this.figmaAlignToCSS('counter', node.counterAxisAlignItems),
          wrap: node.layoutWrap === 'WRAP' ? 'wrap' : 'nowrap',
        };
      }

      // Children recursivo (1 nível para matching)
      if (node.children) {
        tokens.children = node.children
          .filter((c) => c.visible !== false)
          .map((c) => this.extractFigmaTokens(c));
      }

      return tokens;
    },

    // ── DOM Token Extractor ──────────────────────────────────────────────────
    extractDOMTokens(el) {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      return {
        name: el.classList
          ? [...el.classList].find((c) => c !== 'block' && c !== 'wrapper') || el.classList[0] || el.tagName.toLowerCase()
          : el.tagName.toLowerCase(),
        dimensions: {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        spacing: {
          paddingTop: parseFloat(cs.paddingTop) || 0,
          paddingRight: parseFloat(cs.paddingRight) || 0,
          paddingBottom: parseFloat(cs.paddingBottom) || 0,
          paddingLeft: parseFloat(cs.paddingLeft) || 0,
          gap: parseFloat(cs.gap) || parseFloat(cs.columnGap) || 0,
        },
        typography: this.extractTextTokens(el, cs),
        colors: {
          background: this.parseCSSColor(cs.backgroundColor),
          borderColor: this.parseCSSColor(cs.borderColor),
        },
        borders: {
          width: parseFloat(cs.borderWidth) || 0,
          radius: parseFloat(cs.borderRadius) || 0,
        },
        layout: {
          direction: cs.flexDirection || 'row',
          justifyContent: cs.justifyContent || 'normal',
          alignItems: cs.alignItems || 'normal',
          wrap: cs.flexWrap || 'nowrap',
          display: cs.display,
        },
      };
    },

    extractTextTokens(el, cs) {
      // Buscar o primeiro elemento de texto significativo dentro do bloco
      const textEl =
        el.querySelector('h1, h2, h3, h4, h5, h6, p, span, a') || el;
      const ts = textEl !== el ? getComputedStyle(textEl) : cs;
      return {
        fontFamily: ts.fontFamily?.split(',')[0]?.trim().replace(/['"]/g, '') || '',
        fontSize: parseFloat(ts.fontSize) || 0,
        fontWeight: parseInt(ts.fontWeight, 10) || 400,
        lineHeight: parseFloat(ts.lineHeight) || 0,
        letterSpacing: parseFloat(ts.letterSpacing) || 0,
        color: this.parseCSSColor(ts.color),
      };
    },

    // ── Matcher: Figma Children → DOM Blocks ────────────────────────────────
    matchComponents(figmaChildren, domElements) {
      const matches = [];
      const usedDOM = new Set();
      const usedFigma = new Set();

      // Pass 1: name matching (fuzzy)
      figmaChildren.forEach((fc, fi) => {
        const fName = this.normalizeName(fc.name);
        domElements.forEach((de, di) => {
          if (usedDOM.has(di) || usedFigma.has(fi)) return;
          const dName = this.normalizeName(de.name);
          if (this.namesSimilar(fName, dName)) {
            matches.push({ figma: fc, dom: de, figmaIdx: fi, domIdx: di, matchType: 'name' });
            usedDOM.add(di);
            usedFigma.add(fi);
          }
        });
      });

      // Pass 2: order matching para os que sobraram
      let nextDOM = 0;
      figmaChildren.forEach((fc, fi) => {
        if (usedFigma.has(fi)) return;
        while (nextDOM < domElements.length && usedDOM.has(nextDOM)) nextDOM++;
        if (nextDOM < domElements.length) {
          matches.push({
            figma: fc,
            dom: domElements[nextDOM],
            figmaIdx: fi,
            domIdx: nextDOM,
            matchType: 'order',
          });
          usedDOM.add(nextDOM);
          usedFigma.add(fi);
          nextDOM++;
        }
      });

      return matches;
    },

    normalizeName(name) {
      return (name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
    },

    namesSimilar(a, b) {
      if (!a || !b) return false;
      if (a === b) return true;
      if (a.includes(b) || b.includes(a)) return true;
      // Levenshtein simplificado para nomes curtos
      if (a.length < 3 || b.length < 3) return false;
      let common = 0;
      for (const ch of a) { if (b.includes(ch)) common++; }
      return common / Math.max(a.length, b.length) > 0.6;
    },

    // ── Comparator Engine ───────────────────────────────────────────────────
    // Tolerâncias por categoria
    TOLERANCES: {
      dimension: 8,       // ±8px para largura/altura
      spacing: 4,         // ±4px para padding/gap
      fontSize: 1,        // ±1px
      fontWeight: 0,      // exato
      lineHeight: 3,      // ±3px
      letterSpacing: 0.5, // ±0.5px
      borderWidth: 1,     // ±1px
      borderRadius: 2,    // ±2px
      colorDistance: 25,   // distância euclidiana RGB
    },

    compare(figmaTokens, domTokens) {
      const issues = [];

      // ─── DIMENSÕES (Atomic: sizing tokens) ────────────────────────────
      if (figmaTokens.dimensions && domTokens.dimensions) {
        const fd = figmaTokens.dimensions;
        const dd = domTokens.dimensions;

        if (Math.abs(fd.width - dd.width) > this.TOLERANCES.dimension) {
          issues.push({
            category: 'Dimensões',
            principle: 'Sizing Tokens',
            property: 'width',
            expected: `${Math.round(fd.width)}px`,
            actual: `${dd.width}px`,
            diff: `${dd.width - Math.round(fd.width)}px`,
            severity: Math.abs(fd.width - dd.width) > 30 ? 'error' : 'warning',
            reason: `Largura diverge ${Math.abs(Math.round(fd.width) - dd.width)}px do Figma. Verifique max-width, padding do container pai ou box-sizing.`,
          });
        }

        if (Math.abs(fd.height - dd.height) > this.TOLERANCES.dimension) {
          issues.push({
            category: 'Dimensões',
            principle: 'Sizing Tokens',
            property: 'height',
            expected: `${Math.round(fd.height)}px`,
            actual: `${dd.height}px`,
            diff: `${dd.height - Math.round(fd.height)}px`,
            severity: Math.abs(fd.height - dd.height) > 50 ? 'error' : 'warning',
            reason: `Altura diverge. Pode ser causado por line-height, padding interno diferente ou conteúdo dinâmico.`,
          });
        }
      }

      // ─── ESPAÇAMENTO (Grid System / Spacing Scale) ────────────────────
      if (figmaTokens.spacing) {
        const fs = figmaTokens.spacing;
        const ds = domTokens.spacing;
        const spacingProps = [
          ['paddingTop', 'Padding top'],
          ['paddingRight', 'Padding right'],
          ['paddingBottom', 'Padding bottom'],
          ['paddingLeft', 'Padding left'],
          ['gap', 'Gap (item spacing)'],
        ];

        spacingProps.forEach(([prop, label]) => {
          const fv = fs[prop] || 0;
          const dv = ds[prop] || 0;
          if (Math.abs(fv - dv) > this.TOLERANCES.spacing) {
            const isMultipleOf8 = fv % 8 === 0;
            issues.push({
              category: 'Espaçamento',
              principle: isMultipleOf8 ? '8px Grid System' : 'Spacing Scale',
              property: prop,
              expected: `${fv}px`,
              actual: `${dv}px`,
              diff: `${dv - fv}px`,
              severity: Math.abs(fv - dv) > 16 ? 'error' : 'warning',
              reason: `${label} diverge ${Math.abs(fv - dv)}px. ${isMultipleOf8 ? `O Figma usa ${fv}px (múltiplo de 8 — 8px grid system).` : `Valor esperado: ${fv}px.`} Verifique CSS padding/gap do bloco.`,
            });
          }
        });
      }

      // ─── TIPOGRAFIA (Type Scale / Visual Hierarchy) ───────────────────
      if (figmaTokens.typography) {
        const ft = figmaTokens.typography;
        const dt = domTokens.typography;

        if (ft.fontSize && Math.abs(ft.fontSize - dt.fontSize) > this.TOLERANCES.fontSize) {
          issues.push({
            category: 'Tipografia',
            principle: 'Type Scale',
            property: 'font-size',
            expected: `${ft.fontSize}px`,
            actual: `${dt.fontSize}px`,
            severity: 'error',
            reason: `Font-size diverge. Isso afeta a hierarquia visual (Visual Hierarchy). O Figma define ${ft.fontSize}px mas o DOM renderiza ${dt.fontSize}px. Verifique se há override de CSS global ou rem/em mal calculado.`,
          });
        }

        if (ft.fontWeight && Math.abs(ft.fontWeight - dt.fontWeight) > this.TOLERANCES.fontWeight) {
          issues.push({
            category: 'Tipografia',
            principle: 'Visual Hierarchy',
            property: 'font-weight',
            expected: `${ft.fontWeight}`,
            actual: `${dt.fontWeight}`,
            severity: 'warning',
            reason: `Font-weight diverge. ${ft.fontWeight} → ${dt.fontWeight}. Pode indicar que a variante da fonte não foi carregada (ex: SemiBold 600 caindo para Regular 400).`,
          });
        }

        if (ft.lineHeight && Math.abs(ft.lineHeight - dt.lineHeight) > this.TOLERANCES.lineHeight) {
          issues.push({
            category: 'Tipografia',
            principle: 'Vertical Rhythm',
            property: 'line-height',
            expected: `${ft.lineHeight}px`,
            actual: `${dt.lineHeight.toFixed(1)}px`,
            severity: 'warning',
            reason: `Line-height diverge. Isso quebra o ritmo vertical (Vertical Rhythm) e pode afetar espaçamento entre blocos de texto.`,
          });
        }

        if (ft.letterSpacing !== undefined && Math.abs((ft.letterSpacing || 0) - (dt.letterSpacing || 0)) > this.TOLERANCES.letterSpacing) {
          issues.push({
            category: 'Tipografia',
            principle: 'Type Scale',
            property: 'letter-spacing',
            expected: `${ft.letterSpacing || 0}px`,
            actual: `${dt.letterSpacing || 0}px`,
            severity: 'info',
            reason: `Letter-spacing diverge. Comum em headings e labels uppercase.`,
          });
        }

        if (ft.fontFamily && dt.fontFamily) {
          const fFamily = ft.fontFamily.toLowerCase().replace(/\s/g, '');
          const dFamily = dt.fontFamily.toLowerCase().replace(/\s/g, '');
          if (!dFamily.includes(fFamily) && !fFamily.includes(dFamily)) {
            issues.push({
              category: 'Tipografia',
              principle: 'Design System Consistency',
              property: 'font-family',
              expected: ft.fontFamily,
              actual: dt.fontFamily,
              severity: 'error',
              reason: `Fonte diferente. O Figma usa "${ft.fontFamily}" mas o DOM renderiza "${dt.fontFamily}". Verifique se a @font-face está carregada ou se há fallback inesperado.`,
            });
          }
        }

        if (ft.color && dt.color) {
          const dist = this.colorDistance(ft.color, dt.color);
          if (dist > this.TOLERANCES.colorDistance) {
            issues.push({
              category: 'Cores',
              principle: 'Color System',
              property: 'text color',
              expected: `rgb(${ft.color.r}, ${ft.color.g}, ${ft.color.b})`,
              actual: `rgb(${dt.color.r}, ${dt.color.g}, ${dt.color.b})`,
              severity: dist > 60 ? 'error' : 'warning',
              reason: `Cor do texto diverge (distância: ${Math.round(dist)}). Verifique variáveis CSS de cor ou herança de cor do parent.`,
            });
          }
        }
      }

      // ─── CORES DE FUNDO (Color System) ────────────────────────────────
      if (figmaTokens.colors?.background && domTokens.colors?.background) {
        const dist = this.colorDistance(figmaTokens.colors.background, domTokens.colors.background);
        if (dist > this.TOLERANCES.colorDistance) {
          const fb = figmaTokens.colors.background;
          const db = domTokens.colors.background;
          issues.push({
            category: 'Cores',
            principle: 'Color System',
            property: 'background-color',
            expected: `rgb(${fb.r}, ${fb.g}, ${fb.b})`,
            actual: `rgb(${db.r}, ${db.g}, ${db.b})`,
            severity: dist > 60 ? 'error' : 'warning',
            reason: `Background diverge (distância RGB: ${Math.round(dist)}). Verifique variáveis CSS ou herança de background.`,
          });
        }
      }

      // ─── BORDAS (Visual Treatment) ────────────────────────────────────
      if (figmaTokens.borders) {
        const fb = figmaTokens.borders;
        const db = domTokens.borders;

        if (Math.abs(fb.radius - db.radius) > this.TOLERANCES.borderRadius) {
          issues.push({
            category: 'Bordas',
            principle: 'Visual Consistency',
            property: 'border-radius',
            expected: `${fb.radius}px`,
            actual: `${db.radius}px`,
            severity: 'warning',
            reason: `Border-radius diverge. Figma: ${fb.radius}px, DOM: ${db.radius}px.`,
          });
        }

        if (Math.abs(fb.width - db.width) > this.TOLERANCES.borderWidth) {
          issues.push({
            category: 'Bordas',
            principle: 'Visual Consistency',
            property: 'border-width',
            expected: `${fb.width}px`,
            actual: `${db.width}px`,
            severity: 'warning',
            reason: `Border-width diverge.`,
          });
        }
      }

      // ─── LAYOUT (Structural Pattern / Auto-layout) ────────────────────
      if (figmaTokens.layout && domTokens.layout) {
        const fl = figmaTokens.layout;
        const dl = domTokens.layout;

        if (dl.display === 'flex' || dl.display === 'inline-flex') {
          if (fl.direction !== dl.direction) {
            issues.push({
              category: 'Layout',
              principle: 'Structural Pattern',
              property: 'flex-direction',
              expected: fl.direction,
              actual: dl.direction,
              severity: 'error',
              reason: `Direção do flex diverge. Figma Auto-layout é "${fl.direction}" mas o CSS usa "${dl.direction}". Isso muda completamente a composição do bloco.`,
            });
          }

          if (fl.justifyContent && fl.justifyContent !== dl.justifyContent && dl.justifyContent !== 'normal') {
            issues.push({
              category: 'Layout',
              principle: 'Alignment System',
              property: 'justify-content',
              expected: fl.justifyContent,
              actual: dl.justifyContent,
              severity: 'warning',
              reason: `Justify-content diverge. Afeta distribuição dos itens no eixo principal.`,
            });
          }

          if (fl.alignItems && fl.alignItems !== dl.alignItems && dl.alignItems !== 'normal') {
            issues.push({
              category: 'Layout',
              principle: 'Alignment System',
              property: 'align-items',
              expected: fl.alignItems,
              actual: dl.alignItems,
              severity: 'warning',
              reason: `Align-items diverge. Afeta alinhamento no eixo transversal.`,
            });
          }
        } else if (fl.direction) {
          issues.push({
            category: 'Layout',
            principle: 'Structural Pattern',
            property: 'display',
            expected: 'flex',
            actual: dl.display,
            severity: 'warning',
            reason: `Figma usa Auto-layout (flex) mas o DOM não está com display:flex. O bloco pode não se comportar como o design.`,
          });
        }
      }

      return issues;
    },

    // ── 8px Grid Audit ──────────────────────────────────────────────────────
    audit8pxGrid(domTokens) {
      const issues = [];
      const vals = [
        ['padding-top', domTokens.spacing.paddingTop],
        ['padding-right', domTokens.spacing.paddingRight],
        ['padding-bottom', domTokens.spacing.paddingBottom],
        ['padding-left', domTokens.spacing.paddingLeft],
        ['gap', domTokens.spacing.gap],
      ];

      vals.forEach(([prop, val]) => {
        if (val > 0 && val % 4 !== 0) {
          issues.push({
            category: 'Grid System',
            principle: '4px/8px Grid',
            property: prop,
            actual: `${val}px`,
            severity: 'info',
            reason: `${prop}: ${val}px não é múltiplo de 4. Design systems geralmente usam múltiplos de 4 ou 8 para consistência de espaçamento.`,
          });
        }
      });

      return issues;
    },

    // ── Full Page Analysis ──────────────────────────────────────────────────
    async analyzePage(figmaUrl, token) {
      this.token = token;
      const parsed = this.parseUrl(figmaUrl);
      if (!parsed) throw new Error('URL Figma inválida. Use o formato: figma.com/design/KEY/...');

      const { fileKey, nodeId } = parsed;

      // Buscar dados do Figma
      const figmaNode = await this.fetchNode(fileKey, nodeId);
      const figmaTokens = this.extractFigmaTokens(figmaNode);

      // Buscar imagem renderizada do Figma para referência visual
      let figmaImageUrl = null;
      if (nodeId) {
        try {
          figmaImageUrl = await this.fetchImage(fileKey, nodeId);
        } catch { /* sem imagem — ok */ }
      }

      // Coletar blocos DOM
      const domBlocks = $$('.block, .section > div[class]')
        .filter((el) => !el.closest('#qa-helper-root'))
        .map((el) => ({
          el,
          ...this.extractDOMTokens(el),
        }));

      // Coletar sections DOM
      const domSections = $$('.section')
        .filter((el) => !el.closest('#qa-helper-root'))
        .map((el) => ({
          el,
          ...this.extractDOMTokens(el),
        }));

      // Figma children que são frames/components (pular textos soltos e decoração)
      const figmaComponents = (figmaTokens.children || []).filter(
        (c) => c.type === 'FRAME' || c.type === 'COMPONENT' || c.type === 'INSTANCE' || c.type === 'GROUP',
      );

      // Matching
      const domTargets = domBlocks.length > 0 ? domBlocks : domSections;
      const matches = this.matchComponents(figmaComponents, domTargets);

      // Comparar cada match
      const report = {
        figmaFile: fileKey,
        figmaNode: figmaTokens.name,
        figmaImageUrl,
        totalFigmaComponents: figmaComponents.length,
        totalDOMBlocks: domTargets.length,
        matches: matches.length,
        components: [],
      };

      matches.forEach((m) => {
        const issues = this.compare(m.figma, m.dom);
        const gridIssues = this.audit8pxGrid(m.dom);
        report.components.push({
          figmaName: m.figma.name,
          domName: m.dom.name,
          matchType: m.matchType,
          el: m.dom.el,
          issues: [...issues, ...gridIssues],
          errorCount: [...issues, ...gridIssues].filter((i) => i.severity === 'error').length,
          warningCount: [...issues, ...gridIssues].filter((i) => i.severity === 'warning').length,
        });
      });

      // Componentes Figma sem match
      const unmatchedFigma = figmaComponents.filter((_, i) => !matches.find((m) => m.figmaIdx === i));
      unmatchedFigma.forEach((fc) => {
        report.components.push({
          figmaName: fc.name,
          domName: null,
          matchType: 'unmatched',
          el: null,
          issues: [
            {
              category: 'Estrutura',
              principle: 'Atomic Design (Organism)',
              property: 'presença',
              expected: `Componente "${fc.name}"`,
              actual: 'Ausente no DOM',
              severity: 'error',
              reason: `Componente "${fc.name}" existe no Figma mas não foi encontrado na página. Pode estar faltando o bloco, ou o nome da classe não corresponde.`,
            },
          ],
          errorCount: 1,
          warningCount: 0,
        });
      });

      return report;
    },

    // ── Análise via JSON colado (fallback CORS) ─────────────────────────────
    analyzeFromJSON(jsonData) {
      let figmaNode;
      try {
        const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        // Aceita formato completo da API (/v1/files/KEY/nodes) ou nó direto
        if (parsed.nodes) {
          const firstKey = Object.keys(parsed.nodes)[0];
          figmaNode = parsed.nodes[firstKey]?.document;
        } else if (parsed.document) {
          figmaNode = parsed.document;
        } else if (parsed.type) {
          figmaNode = parsed;
        }
        if (!figmaNode) throw new Error('JSON inválido');
      } catch (e) {
        throw new Error(`JSON inválido. Cole o resultado da API /v1/files/KEY/nodes ou o nó exportado. (${e.message})`);
      }

      const figmaTokens = this.extractFigmaTokens(figmaNode);

      const domBlocks = $$('.block, .section > div[class]')
        .filter((el) => !el.closest('#qa-helper-root'))
        .map((el) => ({ el, ...this.extractDOMTokens(el) }));

      const domSections = $$('.section')
        .filter((el) => !el.closest('#qa-helper-root'))
        .map((el) => ({ el, ...this.extractDOMTokens(el) }));

      const figmaComponents = (figmaTokens.children || []).filter(
        (c) => c.type === 'FRAME' || c.type === 'COMPONENT' || c.type === 'INSTANCE' || c.type === 'GROUP',
      );

      const domTargets = domBlocks.length > 0 ? domBlocks : domSections;
      const matches = this.matchComponents(figmaComponents, domTargets);

      const report = {
        figmaFile: 'JSON manual',
        figmaNode: figmaTokens.name,
        figmaImageUrl: null,
        totalFigmaComponents: figmaComponents.length,
        totalDOMBlocks: domTargets.length,
        matches: matches.length,
        components: [],
      };

      matches.forEach((m) => {
        const issues = this.compare(m.figma, m.dom);
        const gridIssues = this.audit8pxGrid(m.dom);
        report.components.push({
          figmaName: m.figma.name,
          domName: m.dom.name,
          matchType: m.matchType,
          el: m.dom.el,
          issues: [...issues, ...gridIssues],
          errorCount: [...issues, ...gridIssues].filter((i) => i.severity === 'error').length,
          warningCount: [...issues, ...gridIssues].filter((i) => i.severity === 'warning').length,
        });
      });

      const unmatchedFigma = figmaComponents.filter((_, i) => !matches.find((m) => m.figmaIdx === i));
      unmatchedFigma.forEach((fc) => {
        report.components.push({
          figmaName: fc.name,
          domName: null,
          matchType: 'unmatched',
          el: null,
          issues: [{
            category: 'Estrutura',
            principle: 'Atomic Design (Organism)',
            property: 'presença',
            expected: `Componente "${fc.name}"`,
            actual: 'Ausente no DOM',
            severity: 'error',
            reason: `Componente "${fc.name}" existe no Figma mas não foi encontrado na página.`,
          }],
          errorCount: 1,
          warningCount: 0,
        });
      });

      return report;
    },
  };

  // ─── UI: PAINEL FLUTUANTE ───────────────────────────────────────────────────
  function buildUI() {
    // Container raiz com Shadow DOM para isolamento total
    const root = createEl('div', { id: 'qa-helper-root' });
    root.style.cssText =
      'position:fixed;top:16px;right:16px;z-index:2147483646;font-family:system-ui,-apple-system,sans-serif;';
    document.body.appendChild(root);

    const shadow = root.attachShadow({ mode: 'open' });

    // Estilos do painel
    const style = createEl('style');
    style.textContent = `
      :host { all: initial; font-family: system-ui, -apple-system, sans-serif; }
      * { box-sizing: border-box; margin: 0; padding: 0; }

      .qa-panel {
        width: 420px;
        max-height: 85vh;
        background: #0f172a;
        color: #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        font-size: 13px;
        line-height: 1.5;
        resize: both;
      }

      .qa-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        background: #1e293b;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        cursor: move;
        user-select: none;
      }
      .qa-header h2 {
        font-size: 14px;
        font-weight: 700;
        color: #f8fafc;
        letter-spacing: -0.01em;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .qa-header h2::before {
        content: '';
        width: 8px;
        height: 8px;
        background: #22c55e;
        border-radius: 50%;
        display: inline-block;
      }
      .qa-close {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        padding: 4px;
        border-radius: 4px;
      }
      .qa-close:hover { background: rgba(255,255,255,0.08); color: #f8fafc; }

      .qa-tabs {
        display: flex;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        background: #1e293b;
      }
      .qa-tab {
        flex: 1;
        padding: 10px 8px;
        text-align: center;
        font-size: 12px;
        font-weight: 500;
        color: #64748b;
        border: none;
        background: none;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 0.15s;
      }
      .qa-tab:hover { color: #94a3b8; background: rgba(255,255,255,0.03); }
      .qa-tab.active {
        color: #3b82f6;
        border-bottom-color: #3b82f6;
        background: rgba(59,130,246,0.06);
      }

      .qa-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
      }
      .qa-body::-webkit-scrollbar { width: 6px; }
      .qa-body::-webkit-scrollbar-track { background: transparent; }
      .qa-body::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }

      .qa-section { margin-bottom: 16px; }
      .qa-section-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #64748b;
        margin-bottom: 8px;
      }

      .qa-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.1);
        background: #1e293b;
        color: #e2e8f0;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
      }
      .qa-btn:hover { background: #334155; border-color: rgba(255,255,255,0.15); }
      .qa-btn:active { transform: scale(0.97); }
      .qa-btn.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; }
      .qa-btn.primary:hover { background: #2563eb; }
      .qa-btn.danger { background: #ef4444; border-color: #ef4444; color: #fff; }
      .qa-btn.danger:hover { background: #dc2626; }
      .qa-btn-group { display: flex; gap: 8px; flex-wrap: wrap; }

      .qa-card {
        background: #1e293b;
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 8px;
      }

      .qa-issue {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 10px 12px;
        background: #1e293b;
        border-radius: 8px;
        margin-bottom: 6px;
        border-left: 3px solid transparent;
        cursor: pointer;
        transition: background 0.15s;
      }
      .qa-issue:hover { background: #334155; }
      .qa-issue.error { border-left-color: #ef4444; }
      .qa-issue.warning { border-left-color: #f59e0b; }
      .qa-issue.success { border-left-color: #22c55e; }
      .qa-issue.info { border-left-color: #3b82f6; }

      .qa-issue-icon {
        flex-shrink: 0;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        color: #fff;
      }
      .qa-issue-icon.error { background: #ef4444; }
      .qa-issue-icon.warning { background: #f59e0b; }
      .qa-issue-icon.success { background: #22c55e; }
      .qa-issue-icon.info { background: #3b82f6; }

      .qa-issue-body { flex: 1; min-width: 0; }
      .qa-issue-msg { font-size: 12px; color: #e2e8f0; word-break: break-word; }
      .qa-issue-meta { font-size: 11px; color: #64748b; margin-top: 2px; }

      .qa-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
      }
      .qa-badge.error { background: rgba(239,68,68,0.15); color: #f87171; }
      .qa-badge.warning { background: rgba(245,158,11,0.15); color: #fbbf24; }
      .qa-badge.success { background: rgba(34,197,94,0.15); color: #4ade80; }

      .qa-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 16px;
      }
      .qa-stat {
        background: #1e293b;
        border-radius: 8px;
        padding: 12px;
        text-align: center;
        border: 1px solid rgba(255,255,255,0.06);
      }
      .qa-stat-value {
        font-size: 22px;
        font-weight: 700;
        color: #f8fafc;
      }
      .qa-stat-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #64748b;
        margin-top: 2px;
      }

      .qa-empty {
        text-align: center;
        padding: 32px 16px;
        color: #64748b;
      }
      .qa-empty-icon { font-size: 32px; margin-bottom: 8px; }

      .qa-loader {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        color: #94a3b8;
        font-size: 12px;
      }
      .qa-loader::before {
        content: '';
        width: 16px;
        height: 16px;
        border: 2px solid #334155;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: qa-spin 0.6s linear infinite;
      }
      @keyframes qa-spin { to { transform: rotate(360deg); } }

      .qa-diff-view { margin-top: 12px; }
      .qa-diff-view canvas {
        max-width: 100%;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.1);
      }

      .qa-file-drop {
        border: 2px dashed #334155;
        border-radius: 8px;
        padding: 24px;
        text-align: center;
        color: #64748b;
        cursor: pointer;
        transition: all 0.15s;
        margin-bottom: 12px;
      }
      .qa-file-drop:hover, .qa-file-drop.dragover {
        border-color: #3b82f6;
        background: rgba(59,130,246,0.06);
        color: #94a3b8;
      }

      .qa-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: #94a3b8;
        cursor: pointer;
        margin-bottom: 8px;
      }
      .qa-toggle input { accent-color: #3b82f6; }

      .qa-breakpoint-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        background: rgba(59,130,246,0.12);
        color: #60a5fa;
        margin-bottom: 12px;
      }

      .qa-minimized { width: auto !important; max-height: none !important; }
      .qa-minimized .qa-tabs,
      .qa-minimized .qa-body { display: none; }

      /* ── Figma Comparison Styles ── */
      .qa-input {
        width: 100%;
        padding: 8px 12px;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.1);
        background: #1e293b;
        color: #e2e8f0;
        font-size: 12px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.15s;
        margin-bottom: 8px;
      }
      .qa-input:focus { border-color: #3b82f6; }
      .qa-input::placeholder { color: #475569; }

      .qa-component-card {
        background: #1e293b;
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        margin-bottom: 12px;
        overflow: hidden;
      }
      .qa-component-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .qa-component-header:hover { background: rgba(255,255,255,0.03); }
      .qa-component-name {
        font-size: 13px;
        font-weight: 600;
        color: #f8fafc;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .qa-component-meta { display: flex; gap: 6px; flex-shrink: 0; }
      .qa-component-body {
        padding: 0 14px 14px;
        display: none;
      }
      .qa-component-body.open { display: block; }

      .qa-prop-row {
        display: grid;
        grid-template-columns: 110px 1fr;
        gap: 6px;
        padding: 7px 0;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        font-size: 11px;
        align-items: start;
      }
      .qa-prop-row:last-child { border-bottom: none; }
      .qa-prop-label {
        color: #64748b;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        font-size: 10px;
        padding-top: 2px;
      }
      .qa-prop-detail { color: #e2e8f0; }
      .qa-prop-values {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        align-items: center;
        font-size: 12px;
        margin-bottom: 4px;
      }
      .qa-prop-expected {
        background: rgba(34,197,94,0.12);
        color: #4ade80;
        padding: 1px 8px;
        border-radius: 4px;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 11px;
      }
      .qa-prop-actual {
        background: rgba(239,68,68,0.12);
        color: #f87171;
        padding: 1px 8px;
        border-radius: 4px;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 11px;
      }
      .qa-prop-arrow { color: #475569; font-size: 10px; }
      .qa-prop-reason {
        color: #94a3b8;
        font-size: 11px;
        line-height: 1.5;
      }
      .qa-prop-principle {
        display: inline-block;
        color: #a78bfa;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 2px;
      }

      .qa-figma-ref {
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.08);
        overflow: hidden;
        margin-bottom: 12px;
      }
      .qa-figma-ref img {
        width: 100%;
        display: block;
      }
      .qa-match-type {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 4px;
        font-weight: 500;
      }
      .qa-match-type.name { background: rgba(59,130,246,0.15); color: #60a5fa; }
      .qa-match-type.order { background: rgba(245,158,11,0.15); color: #fbbf24; }
      .qa-match-type.unmatched { background: rgba(239,68,68,0.15); color: #f87171; }
    `;
    shadow.appendChild(style);

    // Painel principal
    const panel = createEl('div', { className: 'qa-panel' });
    shadow.appendChild(panel);

    // Header com drag
    const header = createEl('div', { className: 'qa-header' });
    const title = createEl('h2', {}, ['QA Helper']);
    const closeBtn = createEl('button', { className: 'qa-close' }, ['×']);
    closeBtn.addEventListener('click', () => destroy());
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Drag functionality
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      const rect = root.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      root.style.left = `${e.clientX - dragOffset.x}px`;
      root.style.top = `${e.clientY - dragOffset.y}px`;
      root.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => (isDragging = false));

    // Tabs
    const tabNames = [
      { id: 'figma', label: '🎨 Figma' },
      { id: 'visual', label: '🔍 Visual' },
      { id: 'links', label: '🔗 Links' },
      { id: 'responsive', label: '📱 Responsivo' },
      { id: 'inspect', label: '🧱 EDS' },
    ];

    const tabBar = createEl('div', { className: 'qa-tabs' });
    const tabContents = {};
    let activeTab = 'figma';

    tabNames.forEach(({ id, label }) => {
      const btn = createEl('button', { className: `qa-tab ${id === activeTab ? 'active' : ''}` }, [label]);
      btn.addEventListener('click', () => switchTab(id));
      tabBar.appendChild(btn);
    });
    panel.appendChild(tabBar);

    // Body
    const body = createEl('div', { className: 'qa-body' });
    panel.appendChild(body);

    function switchTab(id) {
      activeTab = id;
      shadow.querySelectorAll('.qa-tab').forEach((t, i) => {
        t.classList.toggle('active', tabNames[i].id === id);
      });
      renderTab(id);
    }

    // ─── TAB: FIGMA DESIGN COMPARISON ──────────────────────────────────────
    function renderFigmaTab() {
      body.innerHTML = '';

      const section = createEl('div', { className: 'qa-section' });
      section.appendChild(createEl('div', { className: 'qa-section-title' }, ['Comparação com Figma']));

      // Figma URL input
      const urlInput = createEl('input', {
        className: 'qa-input',
        type: 'text',
        placeholder: 'Cole a URL do Figma (ex: figma.com/design/KEY/...?node-id=1-2)',
      });

      // Token input
      const tokenInput = createEl('input', {
        className: 'qa-input',
        type: 'password',
        placeholder: 'Figma Personal Access Token',
      });

      // Recuperar token salvo
      if (figmaAnalyzer.token) {
        tokenInput.value = figmaAnalyzer.token;
      } else if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        // Extensão Chrome: recuperar token persistido
        chrome.runtime.sendMessage({ action: 'getToken' }, (resp) => {
          if (resp?.token) {
            tokenInput.value = resp.token;
            figmaAnalyzer.token = resp.token;
          }
        });
      }

      // Salvar token quando o usuário digita
      tokenInput.addEventListener('change', () => {
        const t = tokenInput.value.trim();
        if (t && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ action: 'saveToken', token: t });
        }
      });

      const helpText = createEl('div', {
        style: {
          fontSize: '11px',
          color: '#64748b',
          marginBottom: '12px',
          lineHeight: '1.5',
        },
      });
      helpText.innerHTML = '💡 Token: Figma → Settings → Personal Access Tokens.<br>A URL deve apontar para o frame/page que corresponde a esta página.';

      const btnGroup = createEl('div', { className: 'qa-btn-group' });
      const analyzeBtn = createEl('button', { className: 'qa-btn primary' }, ['▶ Analisar contra Figma']);
      const clearBtn = createEl('button', { className: 'qa-btn' }, ['✕ Limpar']);

      const resultArea = createEl('div', { id: 'qa-figma-result' });

      // ── JSON paste fallback ────────────────────────────────────────────
      const jsonSection = createEl('div', { className: 'qa-section', style: { marginTop: '12px' } });
      const jsonToggle = createEl('label', { className: 'qa-toggle' });
      const jsonCheckbox = createEl('input', { type: 'checkbox' });
      jsonToggle.appendChild(jsonCheckbox);
      jsonToggle.appendChild(document.createTextNode('Modo JSON (fallback se CORS bloquear)'));
      jsonSection.appendChild(jsonToggle);

      const jsonPanel = createEl('div', { style: { display: 'none' } });
      const jsonHelp = createEl('div', {
        style: { fontSize: '11px', color: '#64748b', marginBottom: '8px', lineHeight: '1.5' },
      });
      jsonHelp.innerHTML = 'Se a API falhar por CORS, rode no terminal:<br>';

      // Campo que gera o curl dinamicamente
      const curlBox = createEl('div', {
        style: {
          background: '#0f172a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '6px',
          padding: '8px 10px',
          fontSize: '11px',
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          color: '#94a3b8',
          wordBreak: 'break-all',
          marginBottom: '8px',
          cursor: 'pointer',
          position: 'relative',
        },
      });
      curlBox.textContent = 'Cole a URL acima para gerar o comando curl';
      curlBox.title = 'Clique para copiar';

      // Atualizar curl quando URL ou token mudam
      function updateCurl() {
        const url = urlInput.value.trim();
        const token = tokenInput.value.trim() || 'SEU_TOKEN';
        const parsed = url ? figmaAnalyzer.parseUrl(url) : null;
        if (parsed) {
          const endpoint = parsed.nodeId
            ? `https://api.figma.com/v1/files/${parsed.fileKey}/nodes?ids=${encodeURIComponent(parsed.nodeId)}`
            : `https://api.figma.com/v1/files/${parsed.fileKey}`;
          curlBox.textContent = `curl -s -H "X-Figma-Token: ${token}" "${endpoint}" | pbcopy`;
        } else {
          curlBox.textContent = 'Cole a URL do Figma acima para gerar o curl';
        }
      }
      urlInput.addEventListener('input', updateCurl);
      tokenInput.addEventListener('input', updateCurl);

      curlBox.addEventListener('click', () => {
        navigator.clipboard?.writeText(curlBox.textContent).then(() => {
          curlBox.style.borderColor = '#22c55e';
          setTimeout(() => (curlBox.style.borderColor = 'rgba(255,255,255,0.08)'), 1500);
        });
      });

      const jsonTextarea = createEl('textarea', {
        className: 'qa-input',
        placeholder: 'Cole aqui o JSON retornado pelo curl...',
        style: {
          minHeight: '100px',
          resize: 'vertical',
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          fontSize: '11px',
        },
      });

      const jsonBtn = createEl('button', { className: 'qa-btn primary' }, ['▶ Analisar JSON']);
      jsonBtn.addEventListener('click', () => {
        const json = jsonTextarea.value.trim();
        if (!json) return;
        resultArea.innerHTML = '<div class="qa-loader">Processando JSON...</div>';
        clearHighlights();
        try {
          const report = figmaAnalyzer.analyzeFromJSON(json);
          renderFigmaReport(resultArea, report);
        } catch (err) {
          resultArea.innerHTML = `<div class="qa-issue error"><div class="qa-issue-icon error">✕</div><div class="qa-issue-body"><div class="qa-issue-msg">${err.message}</div></div></div>`;
        }
      });

      jsonPanel.appendChild(jsonHelp);
      jsonPanel.appendChild(curlBox);
      jsonPanel.appendChild(jsonTextarea);
      jsonPanel.appendChild(jsonBtn);
      jsonSection.appendChild(jsonPanel);

      jsonCheckbox.addEventListener('change', () => {
        jsonPanel.style.display = jsonCheckbox.checked ? 'block' : 'none';
      });

      // ── API button handler ─────────────────────────────────────────────
      analyzeBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        const token = tokenInput.value.trim();

        if (!url) {
          resultArea.innerHTML = '<div class="qa-issue warning"><div class="qa-issue-icon warning">!</div><div class="qa-issue-body"><div class="qa-issue-msg">Cole a URL do Figma</div></div></div>';
          return;
        }
        if (!token) {
          resultArea.innerHTML = '<div class="qa-issue warning"><div class="qa-issue-icon warning">!</div><div class="qa-issue-body"><div class="qa-issue-msg">Informe o Personal Access Token do Figma</div></div></div>';
          return;
        }

        resultArea.innerHTML = '<div class="qa-loader">Conectando ao Figma API...</div>';
        analyzeBtn.disabled = true;
        clearHighlights();

        try {
          const report = await figmaAnalyzer.analyzePage(url, token);
          renderFigmaReport(resultArea, report);
        } catch (err) {
          let msg = err.message;
          if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            msg = 'CORS bloqueou a requisição. Use o Modo JSON abaixo — rode o curl no terminal e cole o resultado.';
            // Abrir automaticamente o painel JSON
            jsonCheckbox.checked = true;
            jsonPanel.style.display = 'block';
            updateCurl();
          }
          resultArea.innerHTML = `<div class="qa-issue error"><div class="qa-issue-icon error">✕</div><div class="qa-issue-body"><div class="qa-issue-msg">${msg}</div></div></div>`;
        }

        analyzeBtn.disabled = false;
      });

      clearBtn.addEventListener('click', () => {
        clearHighlights();
        resultArea.innerHTML = '';
      });

      section.appendChild(urlInput);
      section.appendChild(tokenInput);
      section.appendChild(helpText);
      btnGroup.appendChild(analyzeBtn);
      btnGroup.appendChild(clearBtn);
      section.appendChild(btnGroup);
      section.appendChild(resultArea);
      section.appendChild(jsonSection);
      body.appendChild(section);
    }

    function renderFigmaReport(container, report) {
      container.innerHTML = '';

      // Stats
      const totalErrors = report.components.reduce((s, c) => s + c.errorCount, 0);
      const totalWarnings = report.components.reduce((s, c) => s + c.warningCount, 0);

      const stats = createEl('div', { className: 'qa-stats' });
      stats.innerHTML = `
        <div class="qa-stat">
          <div class="qa-stat-value">${report.matches}</div>
          <div class="qa-stat-label">Matches</div>
        </div>
        <div class="qa-stat">
          <div class="qa-stat-value" style="color:${totalErrors > 0 ? '#f87171' : '#4ade80'}">${totalErrors}</div>
          <div class="qa-stat-label">Erros</div>
        </div>
        <div class="qa-stat">
          <div class="qa-stat-value" style="color:${totalWarnings > 0 ? '#fbbf24' : '#4ade80'}">${totalWarnings}</div>
          <div class="qa-stat-label">Warnings</div>
        </div>
      `;
      container.appendChild(stats);

      // Info do Figma
      const infoCard = createEl('div', { className: 'qa-card' });
      infoCard.innerHTML = `
        <div style="font-size:12px;margin-bottom:4px;"><strong>Frame Figma:</strong> ${report.figmaNode}</div>
        <div style="font-size:11px;color:#64748b;">
          ${report.totalFigmaComponents} componentes no Figma · ${report.totalDOMBlocks} blocos no DOM · ${report.matches} matches
        </div>
      `;
      container.appendChild(infoCard);

      // Imagem de referência do Figma
      if (report.figmaImageUrl) {
        const imgContainer = createEl('div', { className: 'qa-figma-ref' });
        const img = createEl('img', { src: report.figmaImageUrl, alt: 'Referência Figma' });
        imgContainer.appendChild(img);
        container.appendChild(imgContainer);
      }

      // Componentes
      if (report.components.length === 0) {
        container.innerHTML += '<div class="qa-empty"><div class="qa-empty-icon">🤷</div>Nenhum componente pareado entre Figma e DOM</div>';
        return;
      }

      // Ordenar: erros primeiro, depois warnings, depois clean
      const sorted = [...report.components].sort((a, b) => b.errorCount - a.errorCount || b.warningCount - a.warningCount);

      sorted.forEach((comp) => {
        const card = createEl('div', { className: 'qa-component-card' });

        // Header
        const header = createEl('div', { className: 'qa-component-header' });
        const nameDiv = createEl('div', { className: 'qa-component-name' });

        const statusDot = createEl('span', {
          style: {
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: comp.errorCount > 0 ? '#ef4444' : comp.warningCount > 0 ? '#f59e0b' : '#22c55e',
            flexShrink: '0',
          },
        });

        const label = comp.domName
          ? `${comp.figmaName} → .${comp.domName}`
          : `${comp.figmaName} (ausente)`;

        nameDiv.appendChild(statusDot);
        nameDiv.appendChild(document.createTextNode(label));

        const metaDiv = createEl('div', { className: 'qa-component-meta' });

        // Match type badge
        const matchBadge = createEl('span', { className: `qa-match-type ${comp.matchType}` }, [comp.matchType]);
        metaDiv.appendChild(matchBadge);

        if (comp.errorCount) {
          const errBadge = createEl('span', { className: 'qa-badge error' }, [`${comp.errorCount}`]);
          metaDiv.appendChild(errBadge);
        }
        if (comp.warningCount) {
          const warnBadge = createEl('span', { className: 'qa-badge warning' }, [`${comp.warningCount}`]);
          metaDiv.appendChild(warnBadge);
        }
        if (!comp.errorCount && !comp.warningCount) {
          metaDiv.appendChild(createEl('span', { className: 'qa-badge success' }, ['✓']));
        }

        header.appendChild(nameDiv);
        header.appendChild(metaDiv);

        // Body (colapsável)
        const bodyDiv = createEl('div', { className: 'qa-component-body' });

        header.addEventListener('click', () => {
          bodyDiv.classList.toggle('open');
          if (comp.el) {
            comp.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            comp.el.style.outline = '3px solid #3b82f6';
            setTimeout(() => { if (comp.el) comp.el.style.outline = ''; }, 2500);
          }
        });

        if (comp.issues.length === 0) {
          bodyDiv.innerHTML = '<div style="color:#4ade80;font-size:12px;padding:4px 0;">Nenhuma divergência encontrada ✓</div>';
        }

        // Agrupar issues por categoria
        const grouped = {};
        comp.issues.forEach((issue) => {
          if (!grouped[issue.category]) grouped[issue.category] = [];
          grouped[issue.category].push(issue);
        });

        Object.entries(grouped).forEach(([category, issues]) => {
          const catTitle = createEl('div', {
            style: {
              fontSize: '11px',
              fontWeight: '700',
              color: '#94a3b8',
              marginTop: '10px',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            },
          }, [category]);
          bodyDiv.appendChild(catTitle);

          issues.forEach((issue) => {
            const row = createEl('div', { className: 'qa-prop-row' });

            const labelDiv = createEl('div', { className: 'qa-prop-label' }, [issue.property]);

            const detailDiv = createEl('div', { className: 'qa-prop-detail' });

            // Principle tag
            if (issue.principle) {
              detailDiv.appendChild(createEl('div', { className: 'qa-prop-principle' }, [issue.principle]));
            }

            // Expected → Actual
            if (issue.expected && issue.actual) {
              const valuesDiv = createEl('div', { className: 'qa-prop-values' });
              valuesDiv.appendChild(createEl('span', { className: 'qa-prop-expected' }, [issue.expected]));
              valuesDiv.appendChild(createEl('span', { className: 'qa-prop-arrow' }, ['→']));
              valuesDiv.appendChild(createEl('span', { className: 'qa-prop-actual' }, [issue.actual]));
              detailDiv.appendChild(valuesDiv);
            }

            // Reason
            if (issue.reason) {
              detailDiv.appendChild(createEl('div', { className: 'qa-prop-reason' }, [issue.reason]));
            }

            row.appendChild(labelDiv);
            row.appendChild(detailDiv);
            bodyDiv.appendChild(row);

            // Highlight no DOM
            if (comp.el && issue.severity === 'error') {
              highlightElement(comp.el, `${issue.property}: ${issue.expected} → ${issue.actual}`, 'error');
            }
          });
        });

        card.appendChild(header);
        card.appendChild(bodyDiv);
        container.appendChild(card);
      });
    }

    // ─── TAB: VISUAL COMPARATOR ──────────────────────────────────────────────
    function renderVisualTab() {
      body.innerHTML = '';

      const section = createEl('div', { className: 'qa-section' });
      const titleEl = createEl('div', { className: 'qa-section-title' }, ['Comparação Visual']);
      section.appendChild(titleEl);

      // File drop area para screenshot de referência
      const drop = createEl('div', { className: 'qa-file-drop' });
      drop.innerHTML = '📷 Arraste ou clique para carregar screenshot de referência';

      const fileInput = createEl('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      drop.addEventListener('click', () => fileInput.click());
      drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        drop.classList.add('dragover');
      });
      drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleRefImage(file);
      });
      fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleRefImage(fileInput.files[0]);
      });

      section.appendChild(drop);
      section.appendChild(fileInput);

      // Botão para selecionar componente
      const pickBtn = createEl('button', { className: 'qa-btn primary' }, ['🎯 Selecionar componente na página']);
      let refImage = null;
      let pickerCleanup = null;

      pickBtn.addEventListener('click', () => {
        pickBtn.textContent = '⏳ Clique no componente... (ESC para cancelar)';
        pickerCleanup = visualComparator.startPicker(async (el) => {
          pickBtn.textContent = '🎯 Selecionar componente na página';
          if (!refImage) {
            // Sem referência, apenas captura
            try {
              const canvas = await visualComparator.captureElement(el);
              showCaptureResult(canvas, el);
            } catch (err) {
              showError(`Erro na captura: ${err.message}`);
            }
            return;
          }
          // Com referência, faz diff
          try {
            const canvas = await visualComparator.captureElement(el);
            showDiffResult(refImage, canvas, el);
          } catch (err) {
            showError(`Erro na comparação: ${err.message}`);
          }
        });
      });
      section.appendChild(pickBtn);

      const resultArea = createEl('div', { id: 'qa-visual-result' });
      section.appendChild(resultArea);
      body.appendChild(section);

      function handleRefImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            refImage = canvas;
            drop.innerHTML = `✅ Referência carregada (${img.width}×${img.height})`;
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }

      function showCaptureResult(canvas, el) {
        const result = shadow.getElementById('qa-visual-result');
        result.innerHTML = '';
        const card = createEl('div', { className: 'qa-card' });
        const blockName = el.classList[0] || el.tagName.toLowerCase();
        card.innerHTML = `<div class="qa-section-title">Captura: .${blockName}</div>`;
        const canvasClone = canvas.cloneNode(true);
        canvas.getContext('2d'); // ensure context
        // Copy canvas content
        const c = document.createElement('canvas');
        c.width = canvas.width;
        c.height = canvas.height;
        c.getContext('2d').drawImage(canvas, 0, 0);
        c.style.cssText = 'max-width:100%;border-radius:6px;border:1px solid rgba(255,255,255,0.1);margin-top:8px;';
        card.appendChild(c);
        result.appendChild(card);
      }

      function showDiffResult(refCanvas, capturedCanvas, el) {
        const result = shadow.getElementById('qa-visual-result');
        result.innerHTML = '';

        const diff = visualComparator.diffCanvases(refCanvas, capturedCanvas);
        const card = createEl('div', { className: 'qa-card' });
        const blockName = el.classList[0] || el.tagName.toLowerCase();

        const severity = diff.diffPercent > 10 ? 'error' : diff.diffPercent > 3 ? 'warning' : 'success';
        card.innerHTML = `
          <div class="qa-section-title">Diff: .${blockName}</div>
          <div style="display:flex;gap:8px;margin:8px 0;">
            <span class="qa-badge ${severity}">${diff.diffPercent}% diferença</span>
            <span class="qa-badge info">Ref: ${diff.dimensions.ref.w}×${diff.dimensions.ref.h}</span>
            <span class="qa-badge info">Real: ${diff.dimensions.cap.w}×${diff.dimensions.cap.h}</span>
          </div>
        `;

        diff.canvas.style.cssText =
          'max-width:100%;border-radius:6px;border:1px solid rgba(255,255,255,0.1);margin-top:8px;';
        card.appendChild(diff.canvas);

        if (diff.dimensions.ref.w !== diff.dimensions.cap.w || diff.dimensions.ref.h !== diff.dimensions.cap.h) {
          const warn = createEl('div', {
            className: 'qa-issue warning',
          });
          warn.innerHTML = `
            <div class="qa-issue-icon warning">!</div>
            <div class="qa-issue-body">
              <div class="qa-issue-msg">Dimensões diferentes entre referência e captura</div>
              <div class="qa-issue-meta">Isso pode distorcer a comparação pixel-a-pixel</div>
            </div>
          `;
          card.appendChild(warn);
        }

        result.appendChild(card);
      }

      function showError(msg) {
        const result = shadow.getElementById('qa-visual-result');
        result.innerHTML = `<div class="qa-issue error"><div class="qa-issue-icon error">✕</div><div class="qa-issue-body"><div class="qa-issue-msg">${msg}</div></div></div>`;
      }
    }

    // ─── TAB: LINKS & A11Y ───────────────────────────────────────────────────
    function renderLinksTab() {
      body.innerHTML = '';

      const section = createEl('div', { className: 'qa-section' });
      const btnGroup = createEl('div', { className: 'qa-btn-group' });

      const auditBtn = createEl('button', { className: 'qa-btn primary' }, ['▶ Auditar Links & Alt-text']);
      const clearBtn = createEl('button', { className: 'qa-btn' }, ['✕ Limpar']);

      const resultArea = createEl('div', { id: 'qa-links-result' });

      auditBtn.addEventListener('click', async () => {
        resultArea.innerHTML = '<div class="qa-loader">Verificando links e imagens...</div>';
        auditBtn.disabled = true;

        try {
          const results = await linkAuditor.run();
          renderLinkResults(resultArea, results);
        } catch (err) {
          resultArea.innerHTML = `<div class="qa-issue error"><div class="qa-issue-icon error">✕</div><div class="qa-issue-body"><div class="qa-issue-msg">${err.message}</div></div></div>`;
        }

        auditBtn.disabled = false;
      });

      clearBtn.addEventListener('click', () => {
        clearHighlights();
        resultArea.innerHTML = '';
      });

      btnGroup.appendChild(auditBtn);
      btnGroup.appendChild(clearBtn);
      section.appendChild(btnGroup);
      section.appendChild(resultArea);
      body.appendChild(section);
    }

    function renderLinkResults(container, results) {
      container.innerHTML = '';

      // Stats
      const stats = createEl('div', { className: 'qa-stats' });
      stats.innerHTML = `
        <div class="qa-stat">
          <div class="qa-stat-value">${results.links.length}</div>
          <div class="qa-stat-label">Links</div>
        </div>
        <div class="qa-stat">
          <div class="qa-stat-value" style="color:${results.brokenLinks.length ? '#f87171' : '#4ade80'}">${results.brokenLinks.length}</div>
          <div class="qa-stat-label">Quebrados</div>
        </div>
        <div class="qa-stat">
          <div class="qa-stat-value" style="color:${results.imagesNoAlt.length ? '#f87171' : '#4ade80'}">${results.imagesNoAlt.length}</div>
          <div class="qa-stat-label">Sem Alt</div>
        </div>
      `;
      container.appendChild(stats);

      // Issues
      if (results.issues.length === 0) {
        container.innerHTML += `<div class="qa-empty"><div class="qa-empty-icon">✅</div>Nenhum problema encontrado!</div>`;
        return;
      }

      const issuesTitle = createEl('div', { className: 'qa-section-title' }, [`Problemas (${results.issues.length})`]);
      container.appendChild(issuesTitle);

      results.issues.forEach((issue) => {
        const item = createEl('div', { className: `qa-issue ${issue.type}` });
        const icon = issue.type === 'error' ? '✕' : '!';
        const tag = issue.el.tagName.toLowerCase();
        const cls = issue.el.className
          ? `.${issue.el.className.toString().split(' ').filter(Boolean).slice(0, 2).join('.')}`
          : '';

        item.innerHTML = `
          <div class="qa-issue-icon ${issue.type}">${icon}</div>
          <div class="qa-issue-body">
            <div class="qa-issue-msg">${issue.msg}</div>
            <div class="qa-issue-meta">&lt;${tag}${cls}&gt;</div>
          </div>
        `;

        // Scroll to element on click
        item.addEventListener('click', () => {
          issue.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          issue.el.style.outline = '3px solid #3b82f6';
          setTimeout(() => (issue.el.style.outline = ''), 2000);
        });

        container.appendChild(item);
      });

      // Links list (collapsible)
      const linksSection = createEl('div', { className: 'qa-section', style: { marginTop: '16px' } });
      const toggleEl = createEl('label', { className: 'qa-toggle' });
      const checkbox = createEl('input', { type: 'checkbox' });
      toggleEl.appendChild(checkbox);
      toggleEl.appendChild(document.createTextNode(`Mostrar todos os ${results.links.length} links`));
      linksSection.appendChild(toggleEl);

      const linksList = createEl('div', { style: { display: 'none' } });
      results.links.forEach((link) => {
        const severity = link.status === 'broken' ? 'error' : link.status === 'empty' ? 'warning' : 'info';
        const item = createEl('div', { className: `qa-issue ${severity}` });
        item.innerHTML = `
          <div class="qa-issue-icon ${severity}" style="font-size:8px;">${link.status === 'ok' || link.status === 'external' ? '→' : link.status === 'broken' ? '✕' : '!'}</div>
          <div class="qa-issue-body">
            <div class="qa-issue-msg" style="font-size:11px;word-break:break-all;">${link.href}</div>
            <div class="qa-issue-meta">${link.text.slice(0, 60)} · ${link.status}</div>
          </div>
        `;
        item.addEventListener('click', () => {
          link.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        linksList.appendChild(item);
      });

      checkbox.addEventListener('change', () => {
        linksList.style.display = checkbox.checked ? 'block' : 'none';
      });

      linksSection.appendChild(linksList);
      container.appendChild(linksSection);
    }

    // ─── TAB: RESPONSIVE ─────────────────────────────────────────────────────
    function renderResponsiveTab() {
      body.innerHTML = '';

      const section = createEl('div', { className: 'qa-section' });
      const titleEl = createEl('div', { className: 'qa-section-title' }, ['Análise Responsiva']);
      section.appendChild(titleEl);

      // Current viewport info
      const vpInfo = createEl('div', { className: 'qa-breakpoint-tag' }, [
        `Viewport atual: ${window.innerWidth}×${window.innerHeight}px`,
      ]);
      section.appendChild(vpInfo);

      const btnGroup = createEl('div', { className: 'qa-btn-group' });

      const currentBtn = createEl('button', { className: 'qa-btn primary' }, ['▶ Analisar viewport atual']);
      const allBtn = createEl('button', { className: 'qa-btn' }, ['📐 Analisar 3 breakpoints']);
      const clearBtn = createEl('button', { className: 'qa-btn' }, ['✕ Limpar']);

      const resultArea = createEl('div', { id: 'qa-responsive-result' });

      currentBtn.addEventListener('click', () => {
        clearHighlights();
        resultArea.innerHTML = '<div class="qa-loader">Analisando viewport...</div>';
        // Pequeno delay para UI atualizar
        requestAnimationFrame(() => {
          const result = responsiveAnalyzer.analyzeCurrentViewport();
          renderResponsiveResults(resultArea, { [result.breakpoint]: { ...BREAKPOINTS[result.breakpoint] || { label: `${result.viewportWidth}px`, width: result.viewportWidth }, issues: result.issues.map(i => ({ ...i, selector: `${i.el.tagName.toLowerCase()}${i.el.className ? '.' + i.el.className.toString().split(' ')[0] : ''}` })) } });
        });
      });

      allBtn.addEventListener('click', async () => {
        clearHighlights();
        resultArea.innerHTML = '<div class="qa-loader">Analisando breakpoints...</div>';
        try {
          const results = await responsiveAnalyzer.analyzeAllBreakpoints((msg) => {
            resultArea.innerHTML = `<div class="qa-loader">${msg}</div>`;
          });
          renderResponsiveResults(resultArea, results);
        } catch (err) {
          resultArea.innerHTML = `<div class="qa-issue error"><div class="qa-issue-icon error">✕</div><div class="qa-issue-body"><div class="qa-issue-msg">${err.message}</div></div></div>`;
        }
      });

      clearBtn.addEventListener('click', () => {
        clearHighlights();
        resultArea.innerHTML = '';
      });

      btnGroup.appendChild(currentBtn);
      btnGroup.appendChild(allBtn);
      btnGroup.appendChild(clearBtn);
      section.appendChild(btnGroup);
      section.appendChild(resultArea);
      body.appendChild(section);
    }

    function renderResponsiveResults(container, breakpointResults) {
      container.innerHTML = '';

      let totalIssues = 0;
      Object.values(breakpointResults).forEach((bp) => (totalIssues += bp.issues.length));

      if (totalIssues === 0) {
        container.innerHTML = `<div class="qa-empty"><div class="qa-empty-icon">✅</div>Nenhum problema responsivo encontrado!</div>`;
        return;
      }

      Object.entries(breakpointResults).forEach(([key, bp]) => {
        const bpSection = createEl('div', { className: 'qa-section' });
        const tag = createEl('div', { className: 'qa-breakpoint-tag' }, [
          `${bp.label} (${bp.width}px) — ${bp.issues.length} issue${bp.issues.length !== 1 ? 's' : ''}`,
        ]);
        bpSection.appendChild(tag);

        if (bp.issues.length === 0) {
          bpSection.innerHTML += `<div style="color:#64748b;font-size:12px;padding:8px 0;">Nenhum problema neste breakpoint.</div>`;
        }

        bp.issues.forEach((issue) => {
          const item = createEl('div', { className: `qa-issue ${issue.severity}` });
          const icon = issue.severity === 'error' ? '✕' : '!';
          item.innerHTML = `
            <div class="qa-issue-icon ${issue.severity}">${icon}</div>
            <div class="qa-issue-body">
              <div class="qa-issue-msg">${issue.msg}</div>
              <div class="qa-issue-meta">${issue.category} · ${issue.selector || ''}</div>
            </div>
          `;

          // Se issue tem elemento real (viewport atual), scroll pra ele
          if (issue.el) {
            item.addEventListener('click', () => {
              issue.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              issue.el.style.outline = '3px solid #3b82f6';
              setTimeout(() => (issue.el.style.outline = ''), 2000);
            });
          }

          bpSection.appendChild(item);
        });

        container.appendChild(bpSection);
      });
    }

    // ─── TAB: EDS INSPECTOR ──────────────────────────────────────────────────
    function renderInspectTab() {
      body.innerHTML = '';

      const blocks = edsInspector.getBlocks();
      const sections = edsInspector.getSections();
      const meta = edsInspector.getMetadata();

      // Stats
      const stats = createEl('div', { className: 'qa-stats' });
      stats.innerHTML = `
        <div class="qa-stat">
          <div class="qa-stat-value">${sections.length}</div>
          <div class="qa-stat-label">Sections</div>
        </div>
        <div class="qa-stat">
          <div class="qa-stat-value">${blocks.length}</div>
          <div class="qa-stat-label">Blocks</div>
        </div>
        <div class="qa-stat">
          <div class="qa-stat-value">${$$('img').length}</div>
          <div class="qa-stat-label">Imagens</div>
        </div>
      `;
      body.appendChild(stats);

      // Blocks list
      const blocksSection = createEl('div', { className: 'qa-section' });
      blocksSection.appendChild(createEl('div', { className: 'qa-section-title' }, ['Blocos AEM EDS']));

      if (blocks.length === 0) {
        blocksSection.innerHTML += '<div style="color:#64748b;font-size:12px;">Nenhum bloco .block encontrado.</div>';
      }

      blocks.forEach((block) => {
        const item = createEl('div', { className: 'qa-issue info' });
        item.innerHTML = `
          <div class="qa-issue-icon info">B</div>
          <div class="qa-issue-body">
            <div class="qa-issue-msg">.${block.name}</div>
            <div class="qa-issue-meta">${block.children} children · ${Math.round(block.rect.width)}×${Math.round(block.rect.height)}px</div>
          </div>
        `;
        item.addEventListener('click', () => {
          block.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          block.el.style.outline = '3px dashed #3b82f6';
          setTimeout(() => (block.el.style.outline = ''), 2000);
        });
        blocksSection.appendChild(item);
      });
      body.appendChild(blocksSection);

      // Environment info
      const envSection = createEl('div', { className: 'qa-section' });
      envSection.appendChild(createEl('div', { className: 'qa-section-title' }, ['Ambiente']));
      const envCard = createEl('div', { className: 'qa-card' });
      const url = window.location.href;
      const env = url.includes('.hlx.page')
        ? 'Preview'
        : url.includes('.hlx.live')
          ? 'Live'
          : url.includes('localhost')
            ? 'Localhost'
            : url.includes('.aem.page')
              ? 'AEM Preview'
              : url.includes('.aem.live')
                ? 'AEM Live'
                : 'Outro';

      envCard.innerHTML = `
        <div style="font-size:12px;margin-bottom:4px;"><strong>Ambiente:</strong> ${env}</div>
        <div style="font-size:11px;color:#64748b;word-break:break-all;">${url}</div>
        ${meta['og:title'] ? `<div style="font-size:11px;margin-top:6px;"><strong>og:title:</strong> ${meta['og:title']}</div>` : ''}
        ${meta.description ? `<div style="font-size:11px;margin-top:2px;"><strong>description:</strong> ${meta.description?.slice(0, 100)}...</div>` : ''}
      `;
      envSection.appendChild(envCard);
      body.appendChild(envSection);
    }

    // ─── TAB RENDERER ────────────────────────────────────────────────────────
    function renderTab(id) {
      switch (id) {
        case 'figma':
          renderFigmaTab();
          break;
        case 'visual':
          renderVisualTab();
          break;
        case 'links':
          renderLinksTab();
          break;
        case 'responsive':
          renderResponsiveTab();
          break;
        case 'inspect':
          renderInspectTab();
          break;
        default:
          break;
      }
    }

    // ─── DESTROY ─────────────────────────────────────────────────────────────
    function destroy() {
      clearHighlights();
      root.remove();
      window.__qaHelperActive = false;
    }

    // Atalho: ESC duplo fecha
    let lastEsc = 0;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const now = Date.now();
        if (now - lastEsc < 400) destroy();
        lastEsc = now;
      }
    });

    // Render tab inicial
    renderTab(activeTab);

    console.log(
      '%c[QA Helper]%c Ativo! Use o painel ou pressione ESC duas vezes para fechar.',
      'color:#3b82f6;font-weight:bold;',
      'color:#94a3b8;',
    );
  }

  // ─── INICIALIZAÇÃO ────────────────────────────────────────────────────────
  buildUI();
})();
