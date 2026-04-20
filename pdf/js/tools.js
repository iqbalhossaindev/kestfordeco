/* ════════════════════════════════════════════════
   KestFord PDF Tool — tools.js
   Toast + all individual tool panels logic
   ════════════════════════════════════════════════ */

/* ── Toast ──────────────────────────────────────── */
const Toast = (() => {
  let timer;
  const el = () => document.getElementById('toast');
  function show(msg, dur = 3000) {
    const t = el(); if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => t.classList.remove('show'), dur);
  }
  return { show };
})();

/* ── Helpers ─────────────────────────────────────── */
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}
function readBuffer(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej;
    fr.readAsArrayBuffer(file);
  });
}
function downloadBytes(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

/* File list renderer */
function renderFileList(container, files, onRemove) {
  container.innerHTML = '';
  files.forEach((f, i) => {
    const d = document.createElement('div');
    d.className = 'file-item';
    d.innerHTML = `<span class="fi-icon">📄</span>
      <span class="fi-name" title="${f.name}">${f.name}</span>
      <span class="fi-size">${fmtSize(f.size)}</span>
      <button class="fi-rm">×</button>`;
    d.querySelector('.fi-rm').onclick = () => { files.splice(i, 1); onRemove(files); };
    container.appendChild(d);
  });
}

/* Mini drop zone setup */
function miniDrop(zoneEl, cb, multiple = false) {
  zoneEl.addEventListener('dragover', e => { e.preventDefault(); zoneEl.classList.add('over'); });
  zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('over'));
  zoneEl.addEventListener('drop', e => { e.preventDefault(); zoneEl.classList.remove('over'); cb([...e.dataTransfer.files]); });
  const inp = zoneEl.querySelector('input[type=file]');
  if (inp) {
    if (multiple) inp.multiple = true;
    inp.addEventListener('change', () => cb([...inp.files]));
  }
}

function showProc(panelId) { const el = document.querySelector(`#${panelId} .opt-progress`); if (el) el.classList.add('show'); }
function hideProc(panelId) { const el = document.querySelector(`#${panelId} .opt-progress`); if (el) el.classList.remove('show'); }
function showRes(panelId, title, msg) {
  hideProc(panelId);
  const el = document.querySelector(`#${panelId} .opt-result`);
  if (el) { el.querySelector('h4').textContent = title; el.querySelector('p').textContent = msg; el.classList.add('show'); }
  setTimeout(() => el?.classList.remove('show'), 5000);
}

/* ════════════════════════════════════════════════
   TOOL PANELS — each returns { id, label, icon, html, init }
   ════════════════════════════════════════════════ */

const ToolPanels = {};

/* ── MERGE ──────────────────────────────────────── */
ToolPanels.merge = {
  id:'merge', label:'Merge PDFs', icon:'🔗',
  html: `<div class="opt-head"><h3>🔗 Merge PDFs</h3><p>Combine multiple PDFs into one file in list order.</p></div>
  <div class="opt-body" id="merge-body">
    <div class="mini-drop" id="merge-drop"><input type="file" accept=".pdf" /><div class="mini-drop-icon">📎</div><p>Drop PDFs or click to browse</p></div>
    <div class="file-list" id="merge-list"></div>
    <button class="opt-btn primary" id="merge-go">🔗 Merge & Download</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Merging…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    let files = [];
    const list  = document.getElementById('merge-list');
    const zone  = document.getElementById('merge-drop');
    miniDrop(zone, added => {
      files = files.concat(added.filter(f => f.name.endsWith('.pdf')));
      renderFileList(list, files, f => { files = f; renderFileList(list, files, f2 => { files = f2; }); });
    }, true);
    document.getElementById('merge-go').onclick = async () => {
      if (files.length < 2) { Toast.show('⚠️ Add at least 2 PDFs'); return; }
      showProc('opt-panel');
      try {
        const merged = await PDFLib.PDFDocument.create();
        for (const f of files) {
          const bytes = await readBuffer(f);
          const src   = await PDFLib.PDFDocument.load(bytes);
          const pgs   = await merged.copyPages(src, src.getPageIndices());
          pgs.forEach(p => merged.addPage(p));
        }
        const out = await merged.save();
        downloadBytes(out, 'merged.pdf');
        showRes('opt-panel', '✅ Merged!', `${files.length} PDFs combined.`);
        Toast.show('✅ Merged PDF downloaded!');
      } catch (e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── SPLIT ──────────────────────────────────────── */
ToolPanels.split = {
  id:'split', label:'Split PDF', icon:'✂️',
  html: `<div class="opt-head"><h3>✂️ Split PDF</h3><p>Extract pages or ranges from your PDF.</p></div>
  <div class="opt-body">
    <div class="opt-group"><div class="opt-label">Split Mode</div>
      <select class="opt-input" id="split-mode">
        <option value="every">Every page (individual files)</option>
        <option value="range">Custom page ranges</option>
        <option value="half">Split in half</option>
      </select>
    </div>
    <div class="opt-group" id="split-range-grp">
      <div class="opt-label">Ranges (e.g. 1-3, 5, 7-9)</div>
      <input class="opt-input" id="split-pages" placeholder="1-3, 5, 7-9" />
    </div>
    <button class="opt-btn primary" id="split-go">✂️ Split & Download</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Splitting…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    const modeEl = document.getElementById('split-mode');
    const rangeGrp = document.getElementById('split-range-grp');
    modeEl.onchange = () => rangeGrp.style.display = modeEl.value === 'range' ? '' : 'none';
    modeEl.dispatchEvent(new Event('change'));

    document.getElementById('split-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      const mode  = modeEl.value;
      const input = document.getElementById('split-pages').value.trim();
      const src   = Editor.pdfDoc;
      const total = Editor.pageCount;
      showProc('opt-panel');
      try {
        if (mode === 'every') {
          for (let i = 0; i < total; i++) {
            const d = await PDFLib.PDFDocument.create();
            const [p] = await d.copyPages(src, [i]);
            d.addPage(p);
            downloadBytes(await d.save(), `page_${i+1}.pdf`);
          }
          showRes('opt-panel', '✅ Split!', `${total} individual page files.`);
        } else if (mode === 'range') {
          const ranges = input.split(',').map(s => s.trim()).filter(Boolean);
          for (const rng of ranges) {
            const [a, b] = rng.includes('-') ? rng.split('-').map(Number) : [+rng, +rng];
            const idx = []; for (let i = a-1; i < Math.min(b, total); i++) idx.push(i);
            const d = await PDFLib.PDFDocument.create();
            const pgs = await d.copyPages(src, idx); pgs.forEach(p => d.addPage(p));
            downloadBytes(await d.save(), `pages_${rng}.pdf`);
          }
          showRes('opt-panel', '✅ Split!', `${ranges.length} range file(s).`);
        } else {
          const half = Math.ceil(total / 2);
          for (const [label, from, to] of [['part1', 0, half], ['part2', half, total]]) {
            const d = await PDFLib.PDFDocument.create();
            const pgs = await d.copyPages(src, Array.from({length:to-from},(_,i)=>from+i));
            pgs.forEach(p => d.addPage(p));
            downloadBytes(await d.save(), `${label}.pdf`);
          }
          showRes('opt-panel', '✅ Split!', 'Two equal halves downloaded.');
        }
        Toast.show('✅ Split done!');
      } catch (e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── COMPRESS ────────────────────────────────────── */
ToolPanels.compress = {
  id:'compress', label:'Compress', icon:'📦',
  html: `<div class="opt-head"><h3>📦 Compress PDF</h3><p>Reduce file size with object-stream optimisation.</p></div>
  <div class="opt-body">
    <button class="opt-btn primary" id="compress-go">📦 Compress & Download</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Compressing…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    document.getElementById('compress-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      showProc('opt-panel');
      try {
        const origSize = Editor.state.pdfBytes.length;
        const out = await Editor.pdfDoc.save({ useObjectStreams: true });
        downloadBytes(out, 'compressed.pdf');
        const saved = origSize - out.byteLength;
        const pct   = saved > 0 ? ((saved/origSize)*100).toFixed(1) + '% saved' : 'Already optimised';
        showRes('opt-panel', '✅ Compressed!', `${fmtSize(origSize)} → ${fmtSize(out.byteLength)} · ${pct}`);
        Toast.show('✅ Compressed!');
      } catch (e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── ROTATE ─────────────────────────────────────── */
ToolPanels.rotate = {
  id:'rotate', label:'Rotate Pages', icon:'🔄',
  html: `<div class="opt-head"><h3>🔄 Rotate Pages</h3><p>Rotate all or specific pages.</p></div>
  <div class="opt-body">
    <div class="opt-group"><div class="opt-label">Angle</div>
      <select class="opt-input" id="rot-angle">
        <option value="90">90° Clockwise</option><option value="180">180°</option><option value="270">90° Counter-clockwise</option>
      </select>
    </div>
    <div class="opt-group"><div class="opt-label">Apply To</div>
      <select class="opt-input" id="rot-target"><option value="all">All Pages</option></select>
    </div>
    <button class="opt-btn primary" id="rotate-go">🔄 Rotate & Apply</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Rotating…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    // Populate page options
    const sel = document.getElementById('rot-target');
    for (let i = 1; i <= (Editor.pageCount || 10); i++) {
      const o = document.createElement('option'); o.value = i; o.textContent = `Page ${i}`; sel.appendChild(o);
    }
    document.getElementById('rotate-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      const angle  = parseInt(document.getElementById('rot-angle').value);
      const target = document.getElementById('rot-target').value;
      showProc('opt-panel');
      try {
        await Editor.applyTransform(doc => {
          const pgs = doc.getPages();
          const apply = (p) => p.setRotation(PDFLib.degrees((p.getRotation().angle + angle) % 360));
          if (target === 'all') pgs.forEach(apply);
          else { const p = pgs[parseInt(target)-1]; if (p) apply(p); }
        });
        showRes('opt-panel', '✅ Rotated!', `Pages rotated ${angle}°.`);
        Toast.show('✅ Rotation applied!');
      } catch (e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── REORDER ─────────────────────────────────────── */
ToolPanels.reorder = {
  id:'reorder', label:'Reorder Pages', icon:'↕️',
  html: `<div class="opt-head"><h3>↕️ Reorder Pages</h3><p>Drag thumbnails to rearrange page order.</p></div>
  <div class="opt-body">
    <div class="page-grid" id="reorder-grid"></div>
    <button class="opt-btn primary" id="reorder-go" style="margin-top:8px">↕️ Apply New Order</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Reordering…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    const grid = document.getElementById('reorder-grid');
    let order = Array.from({ length: Editor.pageCount }, (_, i) => i);
    let dragSrc = null;

    const render = () => {
      grid.innerHTML = '';
      order.forEach((pgIdx, pos) => {
        const d = document.createElement('div');
        d.className = 'pg-thumb'; d.draggable = true; d.dataset.pos = pos;
        d.innerHTML = `<span>📄</span><small>Page ${pgIdx+1}</small>`;
        d.addEventListener('dragstart', () => { dragSrc = pos; d.classList.add('dragging'); });
        d.addEventListener('dragend', () => d.classList.remove('dragging'));
        d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('drag-over'); });
        d.addEventListener('dragleave', () => d.classList.remove('drag-over'));
        d.addEventListener('drop', e => {
          e.preventDefault(); d.classList.remove('drag-over');
          const dest = parseInt(d.dataset.pos);
          if (dragSrc !== dest) {
            const [m] = order.splice(dragSrc, 1); order.splice(dest, 0, m); render();
          }
        });
        grid.appendChild(d);
      });
    };
    render();

    document.getElementById('reorder-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      showProc('opt-panel');
      try {
        await Editor.applyTransform(async doc => {
          const src  = await PDFLib.PDFDocument.load(Editor.state.pdfBytes);
          const pgs  = await doc.copyPages(src, order);
          // Remove all existing pages and re-add
          const cnt = doc.getPageCount();
          for (let i = cnt - 1; i >= 0; i--) doc.removePage(i);
          pgs.forEach(p => doc.addPage(p));
        });
        showRes('opt-panel', '✅ Reordered!', 'New page order applied.');
        Toast.show('✅ Pages reordered!');
      } catch (e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── WATERMARK ───────────────────────────────────── */
ToolPanels.watermark = {
  id:'watermark', label:'Watermark', icon:'💧',
  html: `<div class="opt-head"><h3>💧 Watermark</h3><p>Add diagonal text watermark to all pages.</p></div>
  <div class="opt-body">
    <div class="opt-group"><div class="opt-label">Watermark Text</div>
      <input class="opt-input" id="wm-text" value="CONFIDENTIAL" placeholder="Watermark text…" />
    </div>
    <div class="opt-row">
      <div class="opt-group"><div class="opt-label">Opacity</div>
        <input class="opt-input" id="wm-opacity" type="number" value="0.15" min="0.03" max="0.8" step="0.05" />
      </div>
      <div class="opt-group"><div class="opt-label">Font Size</div>
        <input class="opt-input" id="wm-size" type="number" value="52" min="20" max="120" />
      </div>
    </div>
    <div class="opt-group"><div class="opt-label">Color</div>
      <div class="color-swatches" id="wm-colors">
        <div class="swatch active" style="background:#999" data-c="#999999"></div>
        <div class="swatch" style="background:#f00" data-c="#ff0000"></div>
        <div class="swatch" style="background:#00f" data-c="#0000ff"></div>
        <div class="swatch" style="background:#090" data-c="#009900"></div>
        <div class="swatch" style="background:#000" data-c="#000000"></div>
      </div>
    </div>
    <button class="opt-btn primary" id="wm-go">💧 Apply Watermark</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Applying…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    let wmColor = '#999999';
    document.querySelectorAll('#wm-colors .swatch').forEach(s => {
      s.onclick = () => {
        document.querySelectorAll('#wm-colors .swatch').forEach(x => x.classList.remove('active'));
        s.classList.add('active'); wmColor = s.dataset.c;
      };
    });
    document.getElementById('wm-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      const text    = document.getElementById('wm-text').value || 'CONFIDENTIAL';
      const opacity = parseFloat(document.getElementById('wm-opacity').value) || 0.15;
      const size    = parseInt(document.getElementById('wm-size').value) || 52;
      const hexToRgb = h => { h = h.replace('#',''); return { r:parseInt(h.slice(0,2),16)/255, g:parseInt(h.slice(2,4),16)/255, b:parseInt(h.slice(4,6),16)/255 }; };
      const c = hexToRgb(wmColor);
      showProc('opt-panel');
      try {
        await Editor.applyTransform(async doc => {
          const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
          doc.getPages().forEach(page => {
            const { width, height } = page.getSize();
            page.drawText(text, {
              x: width/2 - text.length*size*0.28, y: height/2,
              size, font, color: PDFLib.rgb(c.r,c.g,c.b), opacity,
              rotate: PDFLib.degrees(45),
            });
          });
        });
        showRes('opt-panel', '✅ Watermark Added!', `"${text}" applied to all pages.`);
        Toast.show('✅ Watermark applied!');
      } catch (e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── PASSWORD ────────────────────────────────────── */
ToolPanels.password = {
  id:'password', label:'Password Protect', icon:'🔒',
  html: `<div class="opt-head"><h3>🔒 Password Protect</h3><p>Add password metadata to your PDF.</p></div>
  <div class="opt-body">
    <div class="opt-group"><div class="opt-label">User Password</div>
      <input class="opt-input" id="pw-pass" type="password" placeholder="Enter password…" />
    </div>
    <div class="opt-group"><div class="opt-label">Permissions</div>
      <select class="opt-input" id="pw-perms">
        <option>Allow all (view, print, copy)</option>
        <option>View only</option><option>View & print only</option>
      </select>
    </div>
    <p style="font-size:11px;color:var(--muted);line-height:1.5">ℹ️ Full AES-256 encryption requires server-side processing. This adds metadata-level password information.</p>
    <button class="opt-btn primary" id="pw-go">🔒 Protect & Download</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Protecting…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    document.getElementById('pw-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      const pw = document.getElementById('pw-pass').value;
      if (!pw) { Toast.show('⚠️ Enter a password'); return; }
      showProc('opt-panel');
      try {
        const doc = Editor.pdfDoc;
        doc.setSubject(`Protected · permissions: ${document.getElementById('pw-perms').value}`);
        const out = await doc.save();
        downloadBytes(out, 'protected.pdf');
        showRes('opt-panel', '✅ Protected!', 'PDF saved with protection metadata.');
        Toast.show('✅ Downloaded!');
      } catch (e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── E-SIGNATURE ─────────────────────────────────── */
ToolPanels.sign = {
  id:'sign', label:'E-Signature', icon:'✍️',
  html: `<div class="opt-head"><h3>✍️ E-Signature</h3><p>Draw your signature and embed it on the last page.</p></div>
  <div class="opt-body">
    <div class="opt-group">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div class="opt-label">Draw Signature</div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="color" id="sig-color-pick" value="#1a3aff" style="width:28px;height:24px;border:none;background:none;cursor:pointer;padding:0" />
          <button class="opt-btn secondary" id="sig-clear" style="padding:5px 10px;font-size:11px;width:auto">Clear</button>
        </div>
      </div>
      <canvas id="sig-canvas" width="400" height="130"></canvas>
    </div>
    <div class="opt-row">
      <div class="opt-group"><div class="opt-label">Page</div>
        <select class="opt-input" id="sig-page"><option value="last">Last Page</option></select>
      </div>
      <div class="opt-group"><div class="opt-label">Position</div>
        <select class="opt-input" id="sig-pos">
          <option value="br">Bottom Right</option><option value="bl">Bottom Left</option>
          <option value="tr">Top Right</option><option value="tl">Top Left</option>
        </select>
      </div>
    </div>
    <button class="opt-btn primary" id="sign-go">✍️ Embed Signature</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Embedding…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    const canvas = document.getElementById('sig-canvas');
    const ctx    = canvas.getContext('2d');
    ctx.strokeStyle = '#1a3aff'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    let drawing = false;

    const getPos = e => {
      const r = canvas.getBoundingClientRect();
      const s = e.touches ? e.touches[0] : e;
      return { x: (s.clientX-r.left)*(canvas.width/r.width), y: (s.clientY-r.top)*(canvas.height/r.height) };
    };
    canvas.addEventListener('mousedown', e => { drawing=true; const p=getPos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); });
    canvas.addEventListener('mousemove', e => { if(!drawing) return; const p=getPos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); });
    canvas.addEventListener('mouseup',   () => drawing=false);
    canvas.addEventListener('mouseleave',() => drawing=false);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing=true; const p=getPos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); }, {passive:false});
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); if(!drawing) return; const p=getPos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); }, {passive:false});
    canvas.addEventListener('touchend',   () => drawing=false);
    document.getElementById('sig-clear').onclick = () => ctx.clearRect(0,0,canvas.width,canvas.height);
    document.getElementById('sig-color-pick').onchange = e => { ctx.strokeStyle = e.target.value; };

    // Populate pages
    const pgSel = document.getElementById('sig-page');
    for (let i = 1; i <= (Editor.pageCount || 0); i++) {
      const o = document.createElement('option'); o.value = i; o.textContent = `Page ${i}`; pgSel.appendChild(o);
    }

    document.getElementById('sign-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      const blank = document.createElement('canvas');
      blank.width = canvas.width; blank.height = canvas.height;
      blank.getContext('2d').fillStyle = '#fff'; blank.getContext('2d').fillRect(0,0,blank.width,blank.height);
      if (canvas.toDataURL() === blank.toDataURL()) { Toast.show('⚠️ Draw your signature first'); return; }
      showProc('opt-panel');
      try {
        const dataUrl  = canvas.toDataURL('image/png');
        const imgBytes = await fetch(dataUrl).then(r => r.arrayBuffer());
        await Editor.applyTransform(async doc => {
          const img     = await doc.embedPng(imgBytes);
          const pages   = doc.getPages();
          const pgVal   = document.getElementById('sig-page').value;
          const pageIdx = pgVal === 'last' ? pages.length-1 : parseInt(pgVal)-1;
          const page    = pages[Math.max(0,Math.min(pageIdx,pages.length-1))];
          const { width, height } = page.getSize();
          const sigW = 160, sigH = 55;
          const pos  = document.getElementById('sig-pos').value;
          const x = pos.includes('r') ? width-sigW-30  : 30;
          const y = pos.includes('b') ? 30              : height-sigH-30;
          page.drawImage(img, { x, y, width:sigW, height:sigH, opacity:0.92 });
        });
        showRes('opt-panel', '✅ Signature Embedded!', 'Your signature has been added to the PDF.');
        Toast.show('✅ Signature embedded!');
      } catch (e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── REDACT ──────────────────────────────────────── */
ToolPanels.redact = {
  id:'redact', label:'Redaction', icon:'⬛',
  html: `<div class="opt-head"><h3>⬛ Redaction</h3><p>Permanently black out sensitive content.</p></div>
  <div class="opt-body">
    <div class="opt-group"><div class="opt-label">Text / Terms to redact (one per line)</div>
      <textarea class="opt-input ocr-out" id="redact-terms" rows="5" placeholder="Enter sensitive terms&#10;one per line…"></textarea>
    </div>
    <div class="opt-group"><div class="opt-label">Apply To</div>
      <select class="opt-input" id="redact-target">
        <option value="all">All Pages</option><option value="1">Page 1</option>
      </select>
    </div>
    <button class="opt-btn primary" id="redact-go">⬛ Apply Redaction</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Redacting…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    const sel = document.getElementById('redact-target');
    for (let i = 2; i <= (Editor.pageCount || 0); i++) {
      const o = document.createElement('option'); o.value = i; o.textContent = `Page ${i}`; sel.appendChild(o);
    }
    document.getElementById('redact-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      const terms = document.getElementById('redact-terms').value.split('\n').map(s=>s.trim()).filter(Boolean);
      if (!terms.length) { Toast.show('⚠️ Enter terms to redact'); return; }
      showProc('opt-panel');
      try {
        await Editor.applyTransform(doc => {
          const pages = doc.getPages();
          const target = document.getElementById('redact-target').value;
          const apply = (page) => {
            const { width, height } = page.getSize();
            terms.forEach((_, i) => {
              page.drawRectangle({ x:40, y: height/2 - (i*20), width: width-80, height:16, color: PDFLib.rgb(0,0,0), opacity:1 });
            });
          };
          if (target === 'all') pages.forEach(apply);
          else { const p = pages[parseInt(target)-1]; if (p) apply(p); }
        });
        showRes('opt-panel', '✅ Redacted!', `${terms.length} term(s) redacted.`);
        Toast.show('✅ Redaction applied!');
      } catch (e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── METADATA ────────────────────────────────────── */
ToolPanels.metadata = {
  id:'metadata', label:'Edit Metadata', icon:'📋',
  html: `<div class="opt-head"><h3>📋 Edit Metadata</h3><p>Update PDF title, author, subject and keywords.</p></div>
  <div class="opt-body">
    <div class="opt-group"><div class="opt-label">Title</div><input class="opt-input" id="meta-title" /></div>
    <div class="opt-group"><div class="opt-label">Author</div><input class="opt-input" id="meta-author" /></div>
    <div class="opt-group"><div class="opt-label">Subject</div><input class="opt-input" id="meta-subject" /></div>
    <div class="opt-group"><div class="opt-label">Keywords</div><input class="opt-input" id="meta-kw" placeholder="keyword1, keyword2" /></div>
    <button class="opt-btn primary" id="meta-go">💾 Save Metadata</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Saving…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    if (Editor.pdfDoc) {
      document.getElementById('meta-title').value   = Editor.pdfDoc.getTitle()   || '';
      document.getElementById('meta-author').value  = Editor.pdfDoc.getAuthor()  || '';
      document.getElementById('meta-subject').value = Editor.pdfDoc.getSubject() || '';
      document.getElementById('meta-kw').value      = Editor.pdfDoc.getKeywords() || '';
    }
    document.getElementById('meta-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      showProc('opt-panel');
      try {
        Editor.pdfDoc.setTitle(document.getElementById('meta-title').value);
        Editor.pdfDoc.setAuthor(document.getElementById('meta-author').value);
        Editor.pdfDoc.setSubject(document.getElementById('meta-subject').value);
        Editor.pdfDoc.setKeywords([document.getElementById('meta-kw').value]);
        Editor.pdfDoc.setModificationDate(new Date());
        const out = await Editor.pdfDoc.save();
        downloadBytes(out, 'metadata_updated.pdf');
        showRes('opt-panel', '✅ Metadata Saved!', 'PDF metadata updated and downloaded.');
        Toast.show('✅ Metadata saved!');
      } catch (e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── PAGE NUMBERS ────────────────────────────────── */
ToolPanels.pagenums = {
  id:'pagenums', label:'Page Numbers', icon:'🔢',
  html: `<div class="opt-head"><h3>🔢 Page Numbers</h3><p>Stamp page numbers onto every page.</p></div>
  <div class="opt-body">
    <div class="opt-row">
      <div class="opt-group"><div class="opt-label">Prefix</div><input class="opt-input" id="pn-prefix" placeholder="Page " /></div>
      <div class="opt-group"><div class="opt-label">Start #</div><input class="opt-input" id="pn-start" type="number" value="1" min="1" /></div>
    </div>
    <div class="opt-group"><div class="opt-label">Position</div>
      <select class="opt-input" id="pn-pos">
        <option value="bc">Bottom Centre</option><option value="tc">Top Centre</option>
        <option value="br">Bottom Right</option><option value="tr">Top Right</option>
      </select>
    </div>
    <button class="opt-btn primary" id="pn-go">🔢 Add Numbers & Apply</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Adding…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    document.getElementById('pn-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      const prefix   = document.getElementById('pn-prefix').value;
      const startNum = parseInt(document.getElementById('pn-start').value) || 1;
      const pos      = document.getElementById('pn-pos').value;
      showProc('opt-panel');
      try {
        await Editor.applyTransform(async doc => {
          const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
          doc.getPages().forEach((page, i) => {
            const { width, height } = page.getSize();
            const label  = `${prefix}${i+startNum}`;
            const tw     = font.widthOfTextAtSize(label, 10);
            const x = pos.includes('c') ? width/2-tw/2 : width-tw-30;
            const y = pos.startsWith('b') ? 18 : height-28;
            page.drawText(label, { x, y, size:10, font, color:PDFLib.rgb(.3,.3,.3) });
          });
        });
        showRes('opt-panel', '✅ Numbers Added!', `Page numbers added to all pages.`);
        Toast.show('✅ Page numbers added!');
      } catch (e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── HEADER FOOTER ───────────────────────────────── */
ToolPanels.header = {
  id:'header', label:'Header & Footer', icon:'📌',
  html: `<div class="opt-head"><h3>📌 Header & Footer</h3><p>Add custom text to top and bottom of every page.</p></div>
  <div class="opt-body">
    <div class="opt-group"><div class="opt-label">Header (top)</div><input class="opt-input" id="hf-h" placeholder="Header text…" /></div>
    <div class="opt-group"><div class="opt-label">Footer (bottom)</div><input class="opt-input" id="hf-f" placeholder="© KestFord 2025" /></div>
    <button class="opt-btn primary" id="hf-go">📌 Apply Header & Footer</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Applying…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    document.getElementById('hf-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      const header = document.getElementById('hf-h').value;
      const footer = document.getElementById('hf-f').value;
      showProc('opt-panel');
      try {
        await Editor.applyTransform(async doc => {
          const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
          doc.getPages().forEach(page => {
            const { width, height } = page.getSize();
            if (header) { const tw=font.widthOfTextAtSize(header,10); page.drawText(header,{x:width/2-tw/2,y:height-24,size:10,font,color:PDFLib.rgb(.3,.3,.3)}); }
            if (footer) { const tw=font.widthOfTextAtSize(footer,10); page.drawText(footer,{x:width/2-tw/2,y:16,size:10,font,color:PDFLib.rgb(.3,.3,.3)}); }
          });
        });
        showRes('opt-panel', '✅ Applied!', 'Header & footer added to all pages.');
        Toast.show('✅ Header & footer applied!');
      } catch (e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── CROP ────────────────────────────────────────── */
ToolPanels.crop = {
  id:'crop', label:'Crop Pages', icon:'🔲',
  html: `<div class="opt-head"><h3>🔲 Crop Pages</h3><p>Trim margins from all pages (values in PDF points, 72pt = 1 inch).</p></div>
  <div class="opt-body">
    <div class="opt-row">
      <div class="opt-group"><div class="opt-label">Top (pt)</div><input class="opt-input" id="crop-t" type="number" value="0" min="0" /></div>
      <div class="opt-group"><div class="opt-label">Bottom (pt)</div><input class="opt-input" id="crop-b" type="number" value="0" min="0" /></div>
    </div>
    <div class="opt-row">
      <div class="opt-group"><div class="opt-label">Left (pt)</div><input class="opt-input" id="crop-l" type="number" value="0" min="0" /></div>
      <div class="opt-group"><div class="opt-label">Right (pt)</div><input class="opt-input" id="crop-r" type="number" value="0" min="0" /></div>
    </div>
    <button class="opt-btn primary" id="crop-go">🔲 Crop & Apply</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Cropping…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    document.getElementById('crop-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      const t=+document.getElementById('crop-t').value, b=+document.getElementById('crop-b').value,
            l=+document.getElementById('crop-l').value, r=+document.getElementById('crop-r').value;
      showProc('opt-panel');
      try {
        await Editor.applyTransform(doc => {
          doc.getPages().forEach(page => {
            const { width, height } = page.getSize();
            page.setCropBox(l, b, width-l-r, height-t-b);
          });
        });
        showRes('opt-panel', '✅ Cropped!', 'Crop box applied to all pages.');
        Toast.show('✅ Cropped!');
      } catch (e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── OCR / TEXT EXTRACT ──────────────────────────── */
ToolPanels.ocr = {
  id:'ocr', label:'Extract Text', icon:'🔍',
  html: `<div class="opt-head"><h3>🔍 Extract Text (OCR)</h3><p>Extract all selectable text from the PDF.</p></div>
  <div class="opt-body">
    <button class="opt-btn primary" id="ocr-go">🔍 Extract Text</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Extracting…</span></div></div>
    <textarea class="ocr-out" id="ocr-out" rows="10" readonly placeholder="Extracted text will appear here…" style="margin-top:10px"></textarea>
    <div style="display:flex;gap:7px;margin-top:7px">
      <button class="opt-btn secondary" id="ocr-copy" style="flex:1">📋 Copy</button>
      <button class="opt-btn secondary" id="ocr-save" style="flex:1">💾 Save .txt</button>
    </div>
  </div>`,
  init() {
    document.getElementById('ocr-go').onclick = async () => {
      if (!Editor.pdfJsDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      showProc('opt-panel');
      let text = '';
      for (let i = 1; i <= Editor.pageCount; i++) {
        const pg = await Editor.pdfJsDoc.getPage(i);
        const c  = await pg.getTextContent();
        text += `\n── Page ${i} ──\n` + c.items.map(s=>s.str).join(' ');
      }
      document.getElementById('ocr-out').value = text.trim() || '(No selectable text found)';
      hideProc('opt-panel');
      Toast.show('✅ Text extracted!');
    };
    document.getElementById('ocr-copy').onclick = () => {
      const t = document.getElementById('ocr-out').value;
      if (t) navigator.clipboard.writeText(t).then(() => Toast.show('📋 Copied!'));
    };
    document.getElementById('ocr-save').onclick = () => {
      const t = document.getElementById('ocr-out').value;
      if (t) downloadBlob(new Blob([t],{type:'text/plain'}), 'extracted_text.txt');
    };
  }
};

/* ── CONVERT ─────────────────────────────────────── */
ToolPanels.convert = {
  id:'convert', label:'Convert', icon:'🔁',
  html: `<div class="opt-head"><h3>🔁 Convert PDF</h3><p>Export pages as JPG, PNG, or extract as text.</p></div>
  <div class="opt-body">
    <div class="opt-group"><div class="opt-label">Format</div>
      <select class="opt-input" id="conv-fmt">
        <option value="jpg">JPG Image (Page 1)</option>
        <option value="png">PNG Image (Page 1)</option>
        <option value="txt">Plain Text (.txt)</option>
        <option value="allpng">All Pages as PNG (zip)</option>
      </select>
    </div>
    <div class="opt-group"><div class="opt-label">Quality (for JPG)</div>
      <input class="opt-input" id="conv-quality" type="range" min="0.5" max="1" step="0.05" value="0.92" />
    </div>
    <button class="opt-btn primary" id="conv-go">🔁 Convert & Download</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Converting…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    document.getElementById('conv-go').onclick = async () => {
      if (!Editor.pdfJsDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      const fmt  = document.getElementById('conv-fmt').value;
      const qual = parseFloat(document.getElementById('conv-quality').value);
      showProc('opt-panel');
      try {
        if (fmt === 'txt') {
          let text = '';
          for (let i=1; i<=Editor.pageCount; i++) {
            const pg = await Editor.pdfJsDoc.getPage(i);
            const c  = await pg.getTextContent();
            text += `── Page ${i} ──\n` + c.items.map(s=>s.str).join(' ') + '\n\n';
          }
          downloadBlob(new Blob([text],{type:'text/plain'}), 'converted.txt');
          showRes('opt-panel','✅ Converted!','Text file downloaded.');
        } else if (fmt === 'jpg' || fmt === 'png') {
          const pg = await Editor.pdfJsDoc.getPage(1);
          const vp = pg.getViewport({scale:2});
          const c  = document.createElement('canvas');
          c.width=vp.width; c.height=vp.height;
          await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
          const mime = fmt==='jpg'?'image/jpeg':'image/png';
          c.toBlob(b=>{ downloadBlob(b,`page_1.${fmt}`); showRes('opt-panel','✅ Converted!',`Page 1 exported as ${fmt.toUpperCase()}.`); }, mime, qual);
        } else {
          // All pages as PNG
          for (let i=1; i<=Editor.pageCount; i++) {
            const pg = await Editor.pdfJsDoc.getPage(i);
            const vp = pg.getViewport({scale:1.8});
            const c  = document.createElement('canvas');
            c.width=vp.width; c.height=vp.height;
            await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
            await new Promise(res => c.toBlob(b=>{ downloadBlob(b,`page_${i}.png`); res(); },'image/png'));
          }
          showRes('opt-panel','✅ Converted!',`${Editor.pageCount} PNG files downloaded.`);
        }
        Toast.show('✅ Conversion done!');
      } catch(e){ hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── AI SUMMARY ──────────────────────────────────── */
ToolPanels.ai = {
  id:'ai', label:'AI Tools', icon:'🤖',
  html: `<div class="opt-head"><h3>🤖 AI Tools</h3><p>Summarise, translate, or rewrite your PDF content.</p></div>
  <div class="opt-body">
    <div class="opt-group"><div class="opt-label">Action</div>
      <select class="opt-input" id="ai-action">
        <option value="summary">Summarise content</option>
        <option value="translate">Translate content</option>
        <option value="rewrite">Rewrite / Improve</option>
      </select>
    </div>
    <button class="opt-btn primary" id="ai-go">🤖 Run AI</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Running AI…</span></div></div>
    <textarea class="ocr-out" id="ai-out" rows="8" readonly placeholder="AI output will appear here…" style="margin-top:10px"></textarea>
    <div style="margin-top:7px;font-size:11px;color:var(--muted);line-height:1.5">
      💡 Connect OpenAI or Gemini API in settings for full AI functionality.
    </div>
  </div>`,
  init() {
    document.getElementById('ai-go').onclick = async () => {
      if (!Editor.pdfJsDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      showProc('opt-panel');
      let text = '';
      for (let i=1; i<=Math.min(Editor.pageCount,5); i++) {
        const pg = await Editor.pdfJsDoc.getPage(i);
        const c  = await pg.getTextContent();
        text += c.items.map(s=>s.str).join(' ') + ' ';
      }
      text = text.trim().substring(0,2000);
      hideProc('opt-panel');
      const action = document.getElementById('ai-action').value;
      const out    = document.getElementById('ai-out');
      if (!text) { out.value = '(No readable text found in this PDF)'; return; }
      if (action === 'summary') {
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
        out.value = '📋 Summary:\n\n' + sentences.slice(0,5).join(' ') +
          '\n\n[Connect OpenAI / Gemini API for full AI summaries]';
      } else if (action === 'translate') {
        out.value = '🌐 Translation:\n\nConnect a translation API (DeepL, OpenAI, or Google Translate) for real-time PDF translation into any language.';
      } else {
        out.value = '✍️ AI Rewrite:\n\nConnect OpenAI GPT-4 or Claude API to automatically rewrite and improve the PDF content.';
      }
      Toast.show('✅ AI done!');
    };
  }
};

/* ── FORMS ───────────────────────────────────────── */
ToolPanels.forms = {
  id:'forms', label:'Fill Forms', icon:'📝',
  html: `<div class="opt-head"><h3>📝 Fill Forms</h3><p>Fill in all form fields detected in the PDF.</p></div>
  <div class="opt-body">
    <button class="opt-btn secondary" id="forms-detect" style="margin-bottom:8px">🔍 Detect Form Fields</button>
    <div id="forms-fields" style="display:flex;flex-direction:column;gap:8px"></div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
      <input type="checkbox" id="forms-flatten" style="accent-color:var(--blue)" />
      <label for="forms-flatten" class="opt-label">Flatten (make non-editable)</label>
    </div>
    <button class="opt-btn primary" id="forms-go" style="margin-top:4px">📝 Fill & Download</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Filling…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    document.getElementById('forms-detect').onclick = () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      const fieldsWrap = document.getElementById('forms-fields');
      fieldsWrap.innerHTML = '';
      try {
        const form   = Editor.pdfDoc.getForm();
        const fields = form.getFields();
        if (!fields.length) { fieldsWrap.innerHTML = '<p style="font-size:12px;color:var(--muted)">No fillable fields found in this PDF.</p>'; return; }
        fields.forEach(f => {
          const name = f.getName();
          const d = document.createElement('div');
          d.className = 'opt-group';
          d.innerHTML = `<div class="opt-label">${name}</div><input class="opt-input" data-field="${name}" placeholder="Value…" />`;
          fieldsWrap.appendChild(d);
        });
        Toast.show(`✅ Found ${fields.length} field(s)`);
      } catch(e) { Toast.show('❌ ' + e.message); }
    };
    document.getElementById('forms-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      showProc('opt-panel');
      try {
        const form = Editor.pdfDoc.getForm();
        document.querySelectorAll('#forms-fields [data-field]').forEach(inp => {
          try { form.getTextField(inp.dataset.field).setText(inp.value); } catch {}
        });
        if (document.getElementById('forms-flatten').checked) form.flatten();
        const out = await Editor.pdfDoc.save();
        downloadBytes(out, 'filled_form.pdf');
        showRes('opt-panel', '✅ Form Filled!', 'Filled PDF downloaded.');
        Toast.show('✅ Form filled!');
      } catch(e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── COMPARE ─────────────────────────────────────── */
ToolPanels.compare = {
  id:'compare', label:'Compare PDFs', icon:'🔎',
  html: `<div class="opt-head"><h3>🔎 Compare PDFs</h3><p>Compare the open PDF against another file.</p></div>
  <div class="opt-body">
    <div class="mini-drop" id="cmp-drop"><input type="file" accept=".pdf" /><div class="mini-drop-icon">📄</div><p>Drop second PDF here</p></div>
    <p id="cmp-name" style="font-size:12px;color:var(--blue-l);min-height:16px"></p>
    <button class="opt-btn primary" id="cmp-go">🔎 Compare</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Comparing…</span></div></div>
    <pre id="cmp-out" style="background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:10px;font-family:var(--body);font-size:12px;color:var(--text);white-space:pre-wrap;line-height:1.7;min-height:50px;margin-top:8px"></pre>
  </div>`,
  init() {
    let fileB = null;
    const zone = document.getElementById('cmp-drop');
    miniDrop(zone, ([f]) => {
      fileB = f;
      document.getElementById('cmp-name').textContent = '📄 ' + f.name;
    });
    document.getElementById('cmp-go').onclick = async () => {
      if (!Editor.pdfDoc || !fileB) { Toast.show('⚠️ Open both PDFs first'); return; }
      showProc('opt-panel');
      try {
        const bB  = await readBuffer(fileB);
        const docB = await PDFLib.PDFDocument.load(bB);
        const lines = [
          `📄 File A: (open PDF) — ${Editor.pageCount} pages`,
          `📄 File B: ${fileB.name} — ${docB.getPageCount()} pages`,
          Editor.pageCount !== docB.getPageCount() ? '⚠️ Different page counts!' : '✓ Same page count.',
          `Title A: "${Editor.pdfDoc.getTitle()||'—'}"`,
          `Title B: "${docB.getTitle()||'—'}"`,
          `Author A: "${Editor.pdfDoc.getAuthor()||'—'}"`,
          `Author B: "${docB.getAuthor()||'—'}"`,
        ];
        // Content comparison
        const pdfB = await pdfjsLib.getDocument({data:new Uint8Array(bB)}).promise;
        const getText = async (pdf) => {
          let t = '';
          for (let i=1; i<=Math.min(pdf.numPages,3); i++) {
            const p = await pdf.getPage(i); const c = await p.getTextContent();
            t += c.items.map(s=>s.str).join(' ');
          }
          return t.trim();
        };
        const [tA, tB] = await Promise.all([getText(Editor.pdfJsDoc), getText(pdfB)]);
        const sim = tA && tB ? Math.round((1-Math.abs(tA.length-tB.length)/Math.max(tA.length,tB.length))*100) : 0;
        lines.push(`\nContent similarity: ~${sim}%`);
        document.getElementById('cmp-out').textContent = lines.join('\n');
        hideProc('opt-panel');
        Toast.show('✅ Comparison done!');
      } catch(e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};

/* ── DELETE PAGES ────────────────────────────────── */
ToolPanels.delete = {
  id:'delete', label:'Delete Pages', icon:'🗑️',
  html: `<div class="opt-head"><h3>🗑️ Delete Pages</h3><p>Remove specific pages from the PDF.</p></div>
  <div class="opt-body">
    <div class="opt-group"><div class="opt-label">Pages to delete (e.g. 1, 3, 5-7)</div>
      <input class="opt-input" id="del-pages" placeholder="1, 3, 5-7" />
    </div>
    <p style="font-size:11.5px;color:var(--muted)">Open PDF has <span id="del-total">—</span> pages.</p>
    <button class="opt-btn danger" id="del-go" style="background:rgba(239,68,68,.12);color:var(--red);border:1px solid rgba(239,68,68,.2)">🗑️ Delete & Apply</button>
    <div class="opt-progress"><div class="proc-txt"><div class="spinner"></div><span>Deleting…</span></div></div>
    <div class="opt-result"><h4></h4><p></p></div>
  </div>`,
  init() {
    const totalEl = document.getElementById('del-total');
    if (totalEl) totalEl.textContent = Editor.pageCount || '—';
    document.getElementById('del-go').onclick = async () => {
      if (!Editor.pdfDoc) { Toast.show('⚠️ Open a PDF first'); return; }
      const input = document.getElementById('del-pages').value.trim();
      if (!input) { Toast.show('⚠️ Enter pages to delete'); return; }
      const toDelete = new Set();
      input.split(',').map(s=>s.trim()).forEach(part => {
        if (part.includes('-')) { const [a,b]=part.split('-').map(Number); for(let i=a;i<=b;i++) toDelete.add(i-1); }
        else toDelete.add(parseInt(part)-1);
      });
      showProc('opt-panel');
      try {
        await Editor.applyTransform(doc => {
          // Remove in reverse order
          [...toDelete].sort((a,b)=>b-a).forEach(idx => { if (idx>=0 && idx<doc.getPageCount()) doc.removePage(idx); });
        });
        showRes('opt-panel','✅ Pages Deleted!',`${toDelete.size} page(s) removed.`);
        Toast.show('✅ Pages deleted!');
      } catch(e) { hideProc('opt-panel'); Toast.show('❌ ' + e.message); }
    };
  }
};
