/* ════════════════════════════════════════════════
   KestFord PDF Tool — editor.js
   Real-time PDF render + annotation engine
   ════════════════════════════════════════════════ */

const Editor = (() => {

  /* ── State ──────────────────────────────────── */
  const S = {
    pdfDoc:       null,   // pdf-lib PDFDocument
    pdfJsDoc:     null,   // PDF.js document
    pdfBytes:     null,   // Uint8Array of current PDF
    pageCount:    0,
    currentPage:  1,
    scale:        1.4,
    rotation:     0,
    tool:         'select', // select|text|draw|highlight|erase|shape
    drawColor:    '#ff0000',
    drawSize:     3,
    highlightColor:'#ffff00',
    fontSize:     16,
    textColor:    '#000000',
    annotations:  {},     // { pageNum: [ {type,data}... ] }
    drawing:      false,
    lastX:        0,
    lastY:        0,
    currentPath:  [],
    pageWrapEls:  [],
    annotCtxs:    {},
    pdfCtxs:      {},
    dirty:        false,  // unsaved annotation changes
  };

  /* ── DOM refs ───────────────────────────────── */
  let canvasArea, toolName;

  /* ── Init ───────────────────────────────────── */
  function init() {
    canvasArea = document.getElementById('canvas-area');
    toolName   = document.getElementById('app-tool-name');
    // listen for zoom shortcuts
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!S.pdfDoc) return;
    if ((e.ctrlKey || e.metaKey) && e.key === '+') { e.preventDefault(); zoom(0.15); }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoom(-0.15); }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); setScale(1.4); }
  }

  /* ── Load PDF ───────────────────────────────── */
  async function loadFile(file) {
    if (!file) return;
    const bytes = await readBuffer(file);
    await loadBytes(new Uint8Array(bytes));
    Toast.show('📄 ' + file.name + ' loaded');
  }

  async function loadBytes(uint8) {
    S.pdfBytes   = uint8;
    S.annotations = {};
    S.currentPage = 1;
    S.dirty = false;

    // Load with pdf-lib for editing
    S.pdfDoc = await PDFLib.PDFDocument.load(uint8, { ignoreEncryption: true });
    S.pageCount = S.pdfDoc.getPageCount();

    // Load with PDF.js for rendering
    S.pdfJsDoc = await pdfjsLib.getDocument({ data: uint8.slice() }).promise;

    // Show editor area
    document.getElementById('empty-state').style.display  = 'none';
    document.getElementById('canvas-area').style.display  = 'flex';
    document.getElementById('canvas-toolbar').style.display = '';
    document.getElementById('mob-canvas-bar').style.display = '';

    await renderAllPages();
    updatePageInfo();
    updateDownloadBtn();
  }

  /* ── Render all pages ───────────────────────── */
  async function renderAllPages() {
    canvasArea.innerHTML = '';
    S.pageWrapEls = [];
    S.annotCtxs   = {};
    S.pdfCtxs     = {};

    for (let n = 1; n <= S.pageCount; n++) {
      const wrap = document.createElement('div');
      wrap.className  = 'page-wrap';
      wrap.dataset.page = n;

      const pdfCanvas   = document.createElement('canvas');
      const annotCanvas = document.createElement('canvas');
      annotCanvas.className = 'annot-canvas active';

      const badge = document.createElement('div');
      badge.className = 'page-num-badge';
      badge.textContent = `Page ${n} of ${S.pageCount}`;

      wrap.appendChild(pdfCanvas);
      wrap.appendChild(annotCanvas);
      wrap.appendChild(badge);
      canvasArea.appendChild(wrap);
      S.pageWrapEls.push(wrap);

      // Bind annotation events
      bindAnnotEvents(annotCanvas, n);

      // Render this page
      await renderPage(n, pdfCanvas, annotCanvas);
    }

    redrawAllAnnotations();
  }

  async function renderPage(n, pdfCanvas, annotCanvas) {
    const page = await S.pdfJsDoc.getPage(n);
    const vp   = page.getViewport({ scale: S.scale, rotation: S.rotation });
    pdfCanvas.width  = annotCanvas.width  = vp.width;
    pdfCanvas.height = annotCanvas.height = vp.height;
    const ctx = pdfCanvas.getContext('2d');
    S.pdfCtxs[n]   = ctx;
    S.annotCtxs[n] = annotCanvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  }

  /* ── Zoom ───────────────────────────────────── */
  async function zoom(delta) { await setScale(Math.min(3.5, Math.max(0.4, S.scale + delta))); }
  async function setScale(s) {
    S.scale = s;
    const el = document.getElementById('ct-zoom');
    if (el) el.value = Math.round(s * 100) + '%';
    if (S.pdfJsDoc) await renderAllPages();
  }

  /* ── Tool switcher ──────────────────────────── */
  function setTool(t) {
    S.tool = t;
    // Update cursor on all annotation canvases
    document.querySelectorAll('.annot-canvas').forEach(c => {
      c.style.cursor = t === 'select' ? 'default'
        : t === 'text'   ? 'text'
        : t === 'erase'  ? 'cell'
        : 'crosshair';
    });
    // Highlight active tool buttons
    document.querySelectorAll('[data-tool-btn]').forEach(b => {
      b.classList.toggle('active', b.dataset.toolBtn === t);
    });
    if (toolName) toolName.textContent = {
      select:'Select', text:'Add Text', draw:'Draw / Pen',
      highlight:'Highlight', erase:'Eraser', shape:'Shapes', stamp:'Stamp'
    }[t] || t;
  }

  /* ── Annotation events ──────────────────────── */
  function bindAnnotEvents(canvas, pageNum) {
    const getPos = e => {
      const r = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return {
        x: (src.clientX - r.left) * (canvas.width / r.width),
        y: (src.clientY - r.top)  * (canvas.height / r.height),
      };
    };

    const down = (e) => {
      if (!S.pdfDoc) return;
      e.preventDefault();
      const pos = getPos(e);

      if (S.tool === 'text') {
        placeTextInput(canvas, pageNum, pos);
        return;
      }
      if (S.tool === 'draw' || S.tool === 'highlight' || S.tool === 'erase') {
        S.drawing   = true;
        S.lastX     = pos.x;
        S.lastY     = pos.y;
        S.currentPath = [pos];
      }
    };

    const move = (e) => {
      if (!S.drawing) return;
      e.preventDefault();
      const pos  = getPos(e);
      const ctx  = S.annotCtxs[pageNum];
      if (!ctx) return;

      if (S.tool === 'draw') {
        ctx.beginPath();
        ctx.strokeStyle = S.drawColor;
        ctx.lineWidth   = S.drawSize;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.moveTo(S.lastX, S.lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      } else if (S.tool === 'highlight') {
        const w = pos.x - S.lastX, h = pos.y - S.lastY;
        redrawAnnotations(pageNum);
        ctx.fillStyle = S.highlightColor + '55';
        ctx.fillRect(S.lastX, S.lastY, w, h);
      } else if (S.tool === 'erase') {
        ctx.clearRect(pos.x - 20, pos.y - 20, 40, 40);
      }

      S.currentPath.push(pos);
      S.lastX = pos.x; S.lastY = pos.y;
    };

    const up = (e) => {
      if (!S.drawing) return;
      S.drawing = false;
      const pos = S.lastX ? { x: S.lastX, y: S.lastY } : null;

      if (S.tool === 'draw' && S.currentPath.length > 1) {
        saveAnnotation(pageNum, { type: 'draw', path: [...S.currentPath], color: S.drawColor, size: S.drawSize });
      } else if (S.tool === 'highlight' && S.currentPath.length > 1) {
        const first = S.currentPath[0], last = S.currentPath[S.currentPath.length - 1];
        saveAnnotation(pageNum, { type: 'highlight', x: first.x, y: first.y, w: last.x - first.x, h: last.y - first.y, color: S.highlightColor });
      }
      S.currentPath = [];
      S.dirty = true;
    };

    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup',   up);
    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchmove',  move, { passive: false });
    canvas.addEventListener('touchend',   up);
  }

  /* ── Place text input ───────────────────────── */
  function placeTextInput(canvas, pageNum, pos) {
    const wrap = canvas.closest('.page-wrap');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const inp = document.createElement('textarea');
    inp.className   = 'text-overlay-input';
    inp.rows        = 2;
    inp.style.left  = (pos.x / scaleX) + 'px';
    inp.style.top   = (pos.y / scaleY) + 'px';
    inp.style.color = S.textColor;
    inp.style.fontSize = (S.fontSize / scaleX) + 'px';
    wrap.appendChild(inp);
    inp.focus();

    const commit = () => {
      const text = inp.value.trim();
      if (text) {
        saveAnnotation(pageNum, {
          type: 'text', x: pos.x, y: pos.y,
          text, fontSize: S.fontSize, color: S.textColor,
        });
        redrawAnnotations(pageNum);
        S.dirty = true;
      }
      inp.remove();
    };

    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => { if (e.key === 'Escape') { inp.remove(); } });
  }

  /* ── Save annotation ────────────────────────── */
  function saveAnnotation(pageNum, ann) {
    if (!S.annotations[pageNum]) S.annotations[pageNum] = [];
    S.annotations[pageNum].push(ann);
    redrawAnnotations(pageNum);
  }

  function undoAnnotation(pageNum) {
    if (!S.annotations[pageNum]?.length) return;
    S.annotations[pageNum].pop();
    redrawAnnotations(pageNum);
    S.dirty = true;
  }

  /* ── Redraw annotations ─────────────────────── */
  function redrawAnnotations(pageNum) {
    const ctx  = S.annotCtxs[pageNum];
    const wrap = S.pageWrapEls[pageNum - 1];
    if (!ctx || !wrap) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const anns = S.annotations[pageNum] || [];
    anns.forEach(a => drawAnnotation(ctx, a));
  }

  function redrawAllAnnotations() {
    for (let n = 1; n <= S.pageCount; n++) redrawAnnotations(n);
  }

  function drawAnnotation(ctx, a) {
    if (a.type === 'draw') {
      if (a.path.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = a.color || '#f00';
      ctx.lineWidth   = a.size  || 3;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.moveTo(a.path[0].x, a.path[0].y);
      a.path.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    } else if (a.type === 'highlight') {
      ctx.fillStyle = (a.color || '#ffff00') + '55';
      ctx.fillRect(a.x, a.y, a.w, a.h);
    } else if (a.type === 'text') {
      ctx.font      = `${a.fontSize || 16}px Arial`;
      ctx.fillStyle = a.color || '#000';
      const lines = a.text.split('\n');
      lines.forEach((line, i) => ctx.fillText(line, a.x, a.y + (a.fontSize || 16) * (i + 1)));
    }
  }

  /* ── Flatten annotations into PDF bytes ─────── */
  async function flattenAnnotations() {
    if (!S.pdfDoc) return null;
    // Re-load fresh copy from bytes
    const doc  = await PDFLib.PDFDocument.load(S.pdfBytes, { ignoreEncryption: true });
    const pages = doc.getPages();
    const font  = await doc.embedFont(PDFLib.StandardFonts.Helvetica);

    for (let n = 1; n <= S.pageCount; n++) {
      const anns = S.annotations[n] || [];
      if (!anns.length) continue;
      const page   = pages[n - 1];
      const { height } = page.getSize();
      // We need the canvas scale to convert pixel coords back to PDF units
      const annotCanvas = S.annotCtxs[n]?.canvas;
      if (!annotCanvas) continue;
      const pdfPage    = await S.pdfJsDoc.getPage(n);
      const vp         = pdfPage.getViewport({ scale: 1 });
      const scaleX     = vp.width  / annotCanvas.width;
      const scaleY     = vp.height / annotCanvas.height;

      anns.forEach(a => {
        try {
          if (a.type === 'text') {
            const pdfX = a.x * scaleX;
            const pdfY = height - a.y * scaleY - (a.fontSize || 16) * scaleY;
            const hex  = a.color || '#000000';
            const c    = hexToRgb(hex);
            page.drawText(a.text, {
              x: pdfX, y: pdfY,
              size: (a.fontSize || 16) * (1 / S.scale) * 1.4,
              font, color: PDFLib.rgb(c.r / 255, c.g / 255, c.b / 255),
            });
          } else if (a.type === 'highlight') {
            const pdfX = a.x * scaleX;
            const pdfY = height - (a.y + a.h) * scaleY;
            const c    = hexToRgb(a.color || '#ffff00');
            page.drawRectangle({
              x: pdfX, y: pdfY,
              width: a.w * scaleX, height: Math.abs(a.h) * scaleY,
              color: PDFLib.rgb(c.r / 255, c.g / 255, c.b / 255),
              opacity: 0.3,
            });
          } else if (a.type === 'draw' && a.path.length > 1) {
            for (let i = 1; i < a.path.length; i++) {
              const p1 = a.path[i - 1], p2 = a.path[i];
              const c  = hexToRgb(a.color || '#ff0000');
              page.drawLine({
                start: { x: p1.x * scaleX, y: height - p1.y * scaleY },
                end:   { x: p2.x * scaleX, y: height - p2.y * scaleY },
                thickness: (a.size || 3) * scaleX,
                color: PDFLib.rgb(c.r / 255, c.g / 255, c.b / 255),
              });
            }
          }
        } catch {}
      });
    }

    return await doc.save();
  }

  /* ── Download current PDF ───────────────────── */
  async function download(filename = 'kestford_edited.pdf') {
    if (!S.pdfDoc) return;
    Toast.show('⚙️ Preparing download…');
    let bytes;
    if (Object.keys(S.annotations).some(k => (S.annotations[k] || []).length > 0)) {
      bytes = await flattenAnnotations();
    } else {
      bytes = await S.pdfDoc.save();
    }
    if (!bytes) { Toast.show('❌ Error generating PDF'); return; }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    S.dirty = false;
    Toast.show('✅ Downloaded!');
  }

  /* ── Apply transformations to pdf-lib doc ───── */
  async function applyTransform(fn) {
    if (!S.pdfDoc) return;
    await fn(S.pdfDoc);
    const bytes = await S.pdfDoc.save();
    await loadBytes(bytes);
  }

  /* ── Page navigation ────────────────────────── */
  function goToPage(n) {
    n = Math.max(1, Math.min(n, S.pageCount));
    S.currentPage = n;
    const wrap = S.pageWrapEls[n - 1];
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updatePageInfo();
  }

  function updatePageInfo() {
    const inp   = document.getElementById('ct-pg');
    const total = document.getElementById('ct-total');
    if (inp)   inp.value      = S.currentPage;
    if (total) total.textContent = S.pageCount;
  }

  function updateDownloadBtn() {
    const btn = document.getElementById('tb-download');
    if (btn) btn.style.display = S.pdfDoc ? '' : 'none';
  }

  /* ── Helpers ────────────────────────────────── */
  function readBuffer(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsArrayBuffer(file);
    });
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16),
    };
  }

  /* ── Public API ─────────────────────────────── */
  return {
    init, loadFile, loadBytes, zoom, setScale, setTool,
    saveAnnotation, undoAnnotation, redrawAnnotations, redrawAllAnnotations,
    download, applyTransform, goToPage, flattenAnnotations,
    get state() { return S; },
    get pdfDoc() { return S.pdfDoc; },
    get pdfJsDoc() { return S.pdfJsDoc; },
    get pageCount() { return S.pageCount; },
    get currentPage() { return S.currentPage; },
  };
})();
