(() => {
  'use strict';

  const COLORS = [
    0xffc42e, 0xff6a32, 0x5edbff, 0xc989ff,
    0x65f2a5, 0xff78c7, 0x8da2ff, 0xffef9d,
    0x55efe7, 0xff5252, 0x95e85f, 0xd6a85f,
    0x7bd0ff, 0xe4e9ff, 0xb6ff57, 0xff9e72,
  ];
  const STAR_COLOR = new THREE.Color(0xffc42e);
  let graphData = null;
  let galaxy = null;
  let points = null;
  let linkLines = null;
  let haloWorld = null;
  let nodePositions = [];
  let nodeColors = null;
  let baseColors = [];
  let raycaster = null;
  let pointer = new THREE.Vector2();
  let hovered = null;
  let activeNode = null;
  let targetCamera = new THREE.Vector3(0, 0, 10.5);
  let lookTarget = new THREE.Vector3(0, 0.2, 0);
  let targetLook = new THREE.Vector3(0, 0.2, 0);
  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let rotationStart = { x: 0, y: 0 };
  let lastInteraction = Date.now();
  let booted = false;

  const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const rand = (seed) => {
    const x = Math.sin(seed * 999.91) * 43758.5453;
    return x - Math.floor(x);
  };
  const cssHex = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

  function buildChrome() {
    const view = document.createElement('div');
    view.id = 'viewSwitch';
    view.innerHTML = '<button class="viewBtn" data-view="core">Core</button><button class="viewBtn" data-view="galaxy">Galaxy</button>';
    document.body.appendChild(view);

    const meta = document.createElement('div');
    meta.id = 'galaxyMeta';
    meta.textContent = 'Indexing FGA-Brain…';
    document.body.appendChild(meta);

    const rail = document.createElement('div');
    rail.id = 'dayRail';
    document.body.appendChild(rail);

    const legend = document.createElement('div');
    legend.id = 'galaxyLegend';
    document.body.appendChild(legend);

    const hint = document.createElement('div');
    hint.id = 'galaxyHint';
    hint.textContent = 'drag to orbit  ·  scroll to travel  ·  select a star to open its note';
    document.body.appendChild(hint);

    const source = document.createElement('aside');
    source.id = 'sourceCard';
    source.innerHTML = '<div class="sourceEyebrow">Source node</div><div class="sourceTitle"></div><div class="sourcePath"></div><div class="sourceExcerpt"></div><div class="sourceActions"><button data-action="open">Open note</button><button data-action="context">+ Context</button></div>';
    document.body.appendChild(source);

    view.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (btn) setView(btn.dataset.view);
    });
    source.querySelector('[data-action="open"]').addEventListener('click', () => activeNode && !activeNode.redacted && openFile(activeNode.path));
    source.querySelector('[data-action="context"]').addEventListener('click', () => {
      if (activeNode && !activeNode.redacted && !contextFiles.includes(activeNode.path)) { contextFiles.push(activeNode.path); renderChips(); }
      source.classList.remove('open');
    });
    renderDayRail();
    setInterval(renderDayRail, 60 * 1000);
  }

  function renderDayRail() {
    const blocks = [
      [8, '8:00', 'Ground'], [8.25, '8:15', 'Jog'], [9.5, '9:30', 'Revenue'],
      [13, '1:00', 'Build'], [15, '3:00', 'Learn'], [17, '5:00', 'People'], [19, '7:00', 'Off'],
    ];
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    let active = 0;
    blocks.forEach((b, i) => { if (hour >= b[0]) active = i; });
    const rail = document.getElementById('dayRail');
    rail.innerHTML = blocks.map((b, i) => `<div class="dayBlock ${i < active ? 'done' : ''} ${i === active ? 'active' : ''}"><span class="dt">${b[1]}</span>${b[2]}</div>`).join('');
  }

  function spriteTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.12, 'rgba(255,255,255,1)');
    g.addColorStop(.32, 'rgba(255,255,255,.72)');
    g.addColorStop(.62, 'rgba(255,255,255,.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function starfield() {
    const count = 1000;
    const pos = [];
    for (let i = 0; i < count; i++) {
      const r = 18 + Math.random() * 28;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc8a0, size: .045, transparent: true, opacity: .48, depthWrite: false }));
  }

  /* Inner habitable surface — matched to Installation 04 reference imagery:
     an Earth-like strip of oceans, green/tan continents, glaciers and swirling
     clouds, with the atmosphere shading into the retaining walls on both rims. */
  function haloTerrainTexture() {
    const W = 2048, H = 256;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const sea = ctx.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, '#24333c'); sea.addColorStop(.16, '#1d4e68');
    sea.addColorStop(.5, '#2a6e90'); sea.addColorStop(.84, '#1d4e68');
    sea.addColorStop(1, '#24333c');
    ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H);
    let s = 7;
    const rnd = () => rand(s++);
    const blob = (x, y, r, color, alpha) => {
      const g = ctx.createRadialGradient(x, y, r * .12, x, y, r);
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha; ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    };
    const LAND = ['#3e5d33', '#49683a', '#6b6b40', '#8a7a4e', '#57713d'];
    for (let i = 0; i < 34; i++) { // continents: clusters of soft landmass blobs
      const cx = rnd() * W, cy = 46 + rnd() * (H - 92), size = 34 + rnd() * 100;
      const n = 12 + Math.floor(rnd() * 12);
      for (let j = 0; j < n; j++) {
        const px = cx + (rnd() - .5) * size * 2.2, py = cy + (rnd() - .5) * size * .8;
        const pr = 9 + rnd() * size * .45;
        const col = LAND[Math.floor(rnd() * LAND.length)];
        const a = .62 + rnd() * .3;
        for (const off of [-W, 0, W]) blob(px + off, py, pr, col, a);
      }
    }
    for (let i = 0; i < 12; i++) { // glaciers hugging the rim walls
      const px = rnd() * W, py = rnd() < .5 ? 30 + rnd() * 26 : H - 30 - rnd() * 26;
      const pr = 10 + rnd() * 26;
      for (const off of [-W, 0, W]) blob(px + off, py, pr, '#dbe7ee', .5);
    }
    for (let i = 0; i < 70; i++) { // cloud streaks
      const px = rnd() * W, py = 22 + rnd() * (H - 44);
      const len = 30 + rnd() * 130, th = 3 + rnd() * 7, a = (rnd() - .5) * .5;
      ctx.globalAlpha = .12 + rnd() * .28;
      ctx.fillStyle = '#f4f9ff';
      for (const off of [-W, 0, W]) {
        ctx.save(); ctx.translate(px + off, py); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(0, 0, len, th, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    const atm = ctx.createLinearGradient(0, 0, 0, H); // rim-wall shadow + air glow
    atm.addColorStop(0, 'rgba(18,23,29,.95)'); atm.addColorStop(.05, 'rgba(70,90,110,.55)');
    atm.addColorStop(.14, 'rgba(140,190,235,.13)'); atm.addColorStop(.5, 'rgba(150,200,245,.03)');
    atm.addColorStop(.86, 'rgba(140,190,235,.13)'); atm.addColorStop(.95, 'rgba(70,90,110,.55)');
    atm.addColorStop(1, 'rgba(18,23,29,.95)');
    ctx.fillStyle = atm; ctx.fillRect(0, 0, W, H);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }

  /* Outer hull — polished dark Forerunner metal: panel plates, seam grooves,
     and the neat rows of blue running lights seen on the ring's exterior. */
  function haloHullTexture() {
    const W = 2048, H = 256;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, '#3a4048'); base.addColorStop(.5, '#23272d'); base.addColorStop(1, '#3a4048');
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    let s = 999;
    const rnd = () => rand(s++);
    for (let i = 0; i < 170; i++) { // panel plates
      const px = rnd() * W, py = rnd() * H, pw = 30 + rnd() * 120, ph = 14 + rnd() * 60;
      ctx.globalAlpha = .1 + rnd() * .14;
      ctx.fillStyle = rnd() < .5 ? '#181c21' : '#4a525c';
      for (const off of [-W, 0, W]) ctx.fillRect(px + off, py, pw, ph);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(8,10,13,.55)';
    for (const y of [.16, .34, .5, .68, .86]) ctx.fillRect(0, y * H, W, 2); // long grooves
    for (let i = 0; i < 46; i++) ctx.fillRect(Math.floor(rnd() * W), 0, 1.5, H); // vertical seams
    for (const y of [.28 * H, .72 * H]) { // neatly arranged blue lights
      for (let x = 16; x < W; x += 64) {
        ctx.globalAlpha = .3; ctx.fillStyle = '#8fd8ff'; ctx.fillRect(x - 3, y - 3, 10, 9);
        ctx.globalAlpha = .95; ctx.fillRect(x, y, 4, 3);
      }
    }
    ctx.globalAlpha = 1;
    const groove = ctx.createLinearGradient(0, H * .46, 0, H * .54); // glowing centerline
    groove.addColorStop(0, 'rgba(120,200,255,0)'); groove.addColorStop(.5, 'rgba(120,200,255,.28)');
    groove.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = groove; ctx.fillRect(0, H * .46, W, H * .08);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }

  /* The Ring itself — a real ringworld band instead of flat glowing circles:
     habitable terrain on the inside of a cylinder, metal hull outside, rim
     walls holding the atmosphere, sunlight raking across it, slow spin. */
  function buildHaloWorld() {
    const ring = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.x = Math.PI / 2; // cylinder axis -> the old ring's normal
    const spinner = new THREE.Group();
    tilt.add(spinner);
    ring.add(tilt);

    const R = 5.86, BAND = .62, HULL = .1;
    const terrainTex = haloTerrainTexture();
    const hullTex = haloHullTexture();
    const terrain = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, BAND - .05, 512, 1, true),
      new THREE.MeshLambertMaterial({
        map: terrainTex, side: THREE.BackSide,
        emissive: 0xffffff, emissiveMap: terrainTex, emissiveIntensity: .52,
      })
    );
    const hull = new THREE.Mesh(
      new THREE.CylinderGeometry(R + HULL, R + HULL, BAND, 512, 1, true),
      new THREE.MeshLambertMaterial({
        map: hullTex, emissive: 0xffffff, emissiveMap: hullTex, emissiveIntensity: .22,
      })
    );
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x4a525c, emissive: 0x1c2126, side: THREE.DoubleSide });
    const wallTop = new THREE.Mesh(new THREE.RingGeometry(R - .02, R + HULL, 512, 1), wallMat);
    wallTop.rotation.x = -Math.PI / 2;
    wallTop.position.y = BAND / 2;
    const wallBot = wallTop.clone();
    wallBot.position.y = -BAND / 2;
    const atmo = new THREE.Mesh(
      new THREE.CylinderGeometry(R - .07, R - .07, BAND * .8, 256, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x8fd0ff, transparent: true, opacity: .045, side: THREE.BackSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    spinner.add(terrain, hull, wallTop, wallBot, atmo);

    const sun = new THREE.DirectionalLight(0xfff1d8, 1.25); // only the ring is lit
    sun.position.set(-7, 9, 6);
    const fill = new THREE.AmbientLight(0x35424f, .9);
    ring.add(sun, fill);

    ring.rotation.set(.98, .08, -.28);
    ring.position.set(0, -.15, -1.55);
    ring.userData.spinner = spinner;
    return ring;
  }

  function layoutGraph(data) {
    const groupIndex = new Map(data.groups.map((g, i) => [g, i]));
    const groupCounts = new Map();
    const positions = new Array(data.nodes.length);
    data.nodes.forEach((node) => {
      const gi = groupIndex.get(node.group) ?? 0;
      const nth = groupCounts.get(node.group) || 0;
      groupCounts.set(node.group, nth + 1);
      const totalGroups = Math.max(1, data.groups.length);
      const gy = totalGroups === 1 ? 0 : 1 - (gi / (totalGroups - 1)) * 2;
      const radial = Math.sqrt(Math.max(0, 1 - gy * gy));
      const ga = gi * 2.399963229728653;
      const center = new THREE.Vector3(
        Math.cos(ga) * radial * 4.15,
        gy * 3.15,
        Math.sin(ga) * radial * 2.6
      );
      const seed = hash(node.path);
      const a = nth * 2.39996 + rand(seed) * .8;
      const localR = .22 + Math.sqrt(nth + 1) * .125 + rand(seed + 1) * .24;
      const localDepth = (rand(seed + 2) - .5) * 1.7;
      positions[node.id] = center.add(new THREE.Vector3(
        Math.cos(a) * localR,
        Math.sin(a) * localR * .72,
        localDepth
      ));
    });
    return positions;
  }

  function disposeGalaxy() {
    if (!galaxy) return;
    scene.remove(galaxy);
    galaxy.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    galaxy = points = linkLines = haloWorld = null;
  }

  function buildGalaxy(data) {
    disposeGalaxy();
    graphData = data;
    nodePositions = layoutGraph(data);
    galaxy = new THREE.Group();
    galaxy.visible = false;

    const groupMap = new Map(data.groups.map((g, i) => [g, COLORS[i % COLORS.length]]));
    const pos = [], colors = [];
    baseColors = [];
    for (const node of data.nodes) {
      const p = nodePositions[node.id];
      pos.push(p.x, p.y, p.z);
      const c = new THREE.Color(groupMap.get(node.group));
      baseColors[node.id] = c.clone();
      colors.push(c.r, c.g, c.b);
    }
    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    nodeColors = new THREE.Float32BufferAttribute(colors, 3);
    pointGeo.setAttribute('color', nodeColors);
    points = new THREE.Points(pointGeo, new THREE.PointsMaterial({
      size: .12, map: spriteTexture(), vertexColors: true, transparent: true, opacity: .96,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));

    const linkPos = [];
    data.links.forEach((link) => {
      const a = nodePositions[link.source], b = nodePositions[link.target];
      if (a && b) linkPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    });
    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute('position', new THREE.Float32BufferAttribute(linkPos, 3));
    linkLines = new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({ color: 0x4bdf9a, transparent: true, opacity: .13, blending: THREE.AdditiveBlending, depthWrite: false }));

    haloWorld = buildHaloWorld();
    galaxy.add(starfield(), haloWorld, linkLines, points);
    galaxy.rotation.x = -.08;
    scene.add(galaxy);
    raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = .13;

    const counts = data.groupCounts || data.nodes.reduce((acc, node) => {
      acc[node.group] = (acc[node.group] || 0) + 1;
      return acc;
    }, {});
    document.getElementById('galaxyMeta').textContent = `${data.noteCount} notes  ·  ${data.links.length} connections  ·  complete vault map  ·  private text stays local`;
    document.getElementById('galaxyLegend').innerHTML = data.groups.map((g, i) => `<span class="legendItem"><i style="--c:${cssHex(COLORS[i % COLORS.length])}"></i>${escapeHtml(g)} <b>${counts[g] || 0}</b></span>`).join('');
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

  function setView(name, persist = true) {
    const useGalaxy = name === 'galaxy' && galaxy;
    window.jarvisGalaxyActive = !!useGalaxy;
    document.body.classList.toggle('galaxy-view', !!useGalaxy);
    document.querySelectorAll('.viewBtn').forEach((b) => b.classList.toggle('active', b.dataset.view === (useGalaxy ? 'galaxy' : 'core')));
    if (galaxy) galaxy.visible = !!useGalaxy;
    // Core view now uses the Cortana image hologram. Keep the legacy orb
    // and its miniature graph hidden; the full Galaxy remains available.
    if (orbCore) orbCore.visible = false;
    if (orbAtmo) orbAtmo.visible = false;
    if (vaultGraph) vaultGraph.visible = false;
    document.getElementById('sourceCard').classList.remove('open');
    hovered = activeNode = null;
    if (useGalaxy) {
      targetCamera.set(0, .3, 10.5);
      targetLook.set(0, .1, 0);
      setState('idle');
    } else {
      targetCamera.set(0, 0, 3);
      targetLook.set(0, 0, 0);
    }
    if (persist) localStorage.setItem('jarvis-view', useGalaxy ? 'galaxy' : 'core');
  }

  function pickNode(e) {
    if (!window.jarvisGalaxyActive || !points || overUI(e)) return null;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(points)[0];
    return hit ? graphData.nodes[hit.index] : null;
  }

  function showSource(node, cited = false) {
    if (!node) return;
    activeNode = node;
    const card = document.getElementById('sourceCard');
    card.classList.toggle('redacted', !!node.redacted);
    card.querySelector('.sourceEyebrow').textContent = node.redacted
      ? `Private topology · ${node.group}`
      : (cited ? 'Answer source' : `Vault · ${node.group}`);
    card.querySelector('.sourceTitle').textContent = node.label;
    card.querySelector('.sourcePath').textContent = node.redacted ? 'LOCAL FGA-BRAIN VAULT ONLY' : node.path;
    card.querySelector('.sourceExcerpt').textContent = node.excerpt || 'No excerpt available.';
    card.querySelectorAll('.sourceActions button').forEach((button) => { button.disabled = !!node.redacted; });
    card.classList.add('open');
    if (cited) { card.classList.remove('sourcePulse'); void card.offsetWidth; card.classList.add('sourcePulse'); }
  }

  function highlight(ids) {
    if (!nodeColors) return;
    const set = new Set(ids);
    graphData.nodes.forEach((node) => {
      const c = set.has(node.id) ? STAR_COLOR : baseColors[node.id].clone().multiplyScalar(set.size ? .22 : 1);
      nodeColors.setXYZ(node.id, c.r, c.g, c.b);
    });
    nodeColors.needsUpdate = true;
    setTimeout(() => {
      if (!nodeColors) return;
      graphData.nodes.forEach((node) => nodeColors.setXYZ(node.id, baseColors[node.id].r, baseColors[node.id].g, baseColors[node.id].b));
      nodeColors.needsUpdate = true;
    }, 9000);
  }

  function flyToNode(node, cited = false) {
    if (!node || !nodePositions[node.id]) return;
    setView('galaxy');
    const world = nodePositions[node.id].clone().applyEuler(galaxy.rotation);
    targetLook.copy(world);
    const direction = world.clone().normalize();
    if (direction.lengthSq() < .01) direction.set(0, 0, 1);
    targetCamera.copy(world.clone().add(direction.multiplyScalar(2.5)).add(new THREE.Vector3(0, .25, 1.8)));
    highlight([node.id]);
    showSource(node, cited);
    lastInteraction = Date.now();
  }

  window.jarvisTraceSources = (sources) => {
    if (!sources || !sources.length || !graphData) return;
    const nodes = sources.map((src) => graphData.nodes.find((n) => n.path === src.path)).filter(Boolean);
    if (!nodes.length) return;
    setView('galaxy');
    highlight(nodes.map((n) => n.id));
    if (nodes.length < 4) flyToNode(nodes[0], true);
    else {
      targetCamera.set(0, .3, 10.5); targetLook.set(0, .1, 0);
      showSource(nodes[0], true);
    }
  };

  window.jarvisRemember = async (text) => {
    addMsg(text, 'thomas');
    input.value = ''; input.style.height = 'auto';
    sendBtn.disabled = true;
    setState('thinking');
    try {
      const res = await fetch('/api/remember', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw || 'Capture failed');
      const data = JSON.parse(raw);
      await refreshGalaxy(data.path);
      const reply = window.CORTANA_STATIC_MODE
        ? `Saved to this display deck, Chief. The local core will need the field report before it becomes permanent vault memory.`
        : `Filed in the vault, Chief. Another star joins the mission map; the paperwork remains mercifully terrestrial.`;
      addMsg(reply, 'jarvis', { label: 'Local memory', effort: 'no model', reason: 'vault capture' });
      setState('speaking');
      speak(reply);
    } catch (err) {
      addMsg(`⚠ ${err.message}`, 'system');
      doneSpeaking();
    } finally { sendBtn.disabled = false; input.focus(); }
  };

  async function refreshGalaxy(flyPath) {
    const res = await fetch('/api/graph?refresh=1');
    if (!res.ok) throw new Error('Galaxy refresh failed');
    const data = await res.json();
    buildGalaxy(data);
    setView('galaxy');
    const node = data.nodes.find((n) => n.path === flyPath);
    if (node) setTimeout(() => flyToNode(node, true), 180);
  }

  function bindControls() {
    window.addEventListener('mousemove', (e) => {
      if (!window.jarvisGalaxyActive) return;
      if (dragging) {
        galaxy.rotation.y = rotationStart.y + (e.clientX - dragStart.x) * .004;
        galaxy.rotation.x = Math.max(-.7, Math.min(.7, rotationStart.x + (e.clientY - dragStart.y) * .003));
        lastInteraction = Date.now();
        return;
      }
      hovered = pickNode(e);
      if (hovered) {
        nodeTip.innerHTML = `<span class="ntype">◈ ${escapeHtml(hovered.group)}</span>${escapeHtml(hovered.label)}`;
        nodeTip.className = 'file'; nodeTip.style.display = 'block';
        nodeTip.style.left = Math.min(e.clientX + 14, window.innerWidth - 260) + 'px';
        nodeTip.style.top = (e.clientY - 28) + 'px'; document.body.style.cursor = 'pointer';
      } else if (!overUI(e)) { nodeTip.style.display = 'none'; document.body.style.cursor = ''; }
    });
    window.addEventListener('mousedown', (e) => {
      if (!window.jarvisGalaxyActive || overUI(e)) return;
      dragging = true; dragStart = { x: e.clientX, y: e.clientY }; rotationStart = { x: galaxy.rotation.x, y: galaxy.rotation.y };
    });
    window.addEventListener('mouseup', (e) => {
      if (!dragging) return;
      const moved = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
      dragging = false;
      if (moved < 5) { const node = pickNode(e); if (node) flyToNode(node); }
    });
    window.addEventListener('wheel', (e) => {
      if (!window.jarvisGalaxyActive || overUI(e)) return;
      targetCamera.z = Math.max(3.2, Math.min(17, targetCamera.z + e.deltaY * .008));
      lastInteraction = Date.now();
    }, { passive: true });
    window.addEventListener('dblclick', (e) => {
      if (!window.jarvisGalaxyActive || overUI(e)) return;
      targetCamera.set(0, .3, 10.5); targetLook.set(0, .1, 0);
      lastInteraction = Date.now();
      document.getElementById('sourceCard').classList.remove('open');
    });
  }

  window.jarvisGalaxyTick = () => {
    if (!galaxy || !window.jarvisGalaxyActive) return;
    if (haloWorld && haloWorld.userData.spinner) haloWorld.userData.spinner.rotation.y += .0006;
    const idleFor = Date.now() - lastInteraction;
    if (!dragging && idleFor > 3500) galaxy.rotation.y += .00034;
    if (!dragging && idleFor > 9500) {
      const t = Date.now() * .0001;
      targetCamera.set(Math.sin(t) * .72, .25 + Math.sin(t * 1.7) * .24, 10.2 + Math.cos(t * .82) * .7);
      targetLook.set(Math.sin(t * .7) * .2, Math.cos(t * .9) * .12, 0);
    }
    camera.position.lerp(targetCamera, .045);
    lookTarget.lerp(targetLook, .055);
    camera.lookAt(lookTarget);
  };

  async function init() {
    buildChrome();
    bindControls();
    window.jarvisGalaxyActive = true;
    document.body.classList.add('galaxy-view');
    if (orbCore) orbCore.visible = false;
    if (orbAtmo) orbAtmo.visible = false;
    if (vaultGraph) vaultGraph.visible = false;
    try {
      const res = await fetch('/api/graph');
      if (!res.ok) throw new Error('Graph unavailable');
      const data = await res.json();
      buildGalaxy(data);
      // Always start in GALAXY. CORE remains fully available from the toggle,
      // its preference plumbing stays intact, and it remains the load fallback.
      setView('galaxy', false);
      if (!booted) {
        booted = true;
        addMsg(`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, Chief. ${data.noteCount} notes indexed. Cortana is online and ready for the mission.`, 'jarvis');
      }
    } catch (err) {
      setView('core', false);
      document.getElementById('galaxyMeta').textContent = 'Galaxy offline · core systems remain available';
      addMsg('Core systems online, Chief. The galaxy is being temperamental; how very celestial of it.', 'jarvis');
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
