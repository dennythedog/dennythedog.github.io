// Denny: masonry photo columns (no cropping) and a full-screen viewer.
(function () {
  "use strict";

  // Masonry: equal-width columns, every photo at its natural shape (nothing
  // cropped). Each item goes to the shortest column, so date order reads
  // roughly left to right, top to bottom.
  function masonry(box, cols) {
    var items = box._items || (box._items = Array.prototype.slice.call(box.children));
    if (box._cols === cols) return;
    box._cols = cols;
    box.innerHTML = "";
    var columns = [], heights = [];
    for (var c = 0; c < cols; c++) {
      var col = document.createElement("div");
      col.className = "col";
      box.appendChild(col);
      columns.push(col); heights.push(0);
    }
    items.forEach(function (el) {
      var k = heights.indexOf(Math.min.apply(null, heights));
      columns[k].appendChild(el);
      heights[k] += el.dataset.h / el.dataset.w + 0.02;
    });
    box.classList.add("ready");
  }

  // Home: 12 photos at random on each visit, one per album per round.
  var poolEl = document.getElementById("hero-pool"), hero = document.querySelector(".hero-collage");
  if (poolEl && hero) {
    var pool = JSON.parse(poolEl.textContent).map(function (list) {
      list = list.slice();
      for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = list[i]; list[i] = list[j]; list[j] = x; }
      return list;
    }).filter(function (l) { return l.length; });
    pool.sort(function () { return Math.random() - 0.5; });
    var picks = [];
    while (picks.length < 12 && pool.some(function (l) { return l.length; })) {
      pool.forEach(function (l) { if (l.length && picks.length < 12) picks.push(l.pop()); });
    }
    if (picks.length) {
      hero.innerHTML = picks.map(function (p) {
        return '<span data-w="' + p.w + '" data-h="' + p.h + '"><img src="' + p.s + '" alt="" width="' + p.w + '" height="' + p.h + '"></span>';
      }).join("");
    }
  }

  // Albums drawer
  var btn = document.querySelector(".menu-btn"), drawerEl = document.querySelector(".drawer"), shade = document.querySelector(".drawer-shade");
  function setDrawer(open) {
    if (!drawerEl) return;
    drawerEl.classList.toggle("open", open);
    drawerEl.setAttribute("aria-hidden", open ? "false" : "true");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    shade.hidden = !open;
    document.documentElement.classList.toggle("drawer-open", open);
  }
  if (btn) {
    btn.addEventListener("click", function () { setDrawer(!drawerEl.classList.contains("open")); });
    shade.addEventListener("click", function () { setDrawer(false); });
    drawerEl.querySelector(".drawer-close").addEventListener("click", function () { setDrawer(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setDrawer(false); });
    var here = location.pathname.replace(/index\.html$/, "");
    drawerEl.querySelectorAll("a").forEach(function (a) {
      if (a.pathname === here) a.classList.add("current");
    });
  }

  function layout() {
    var w = window.innerWidth;
    var cols = w < 560 ? 2 : w < 1000 ? 3 : w < 1800 ? 4 : 5;
    document.querySelectorAll(".masonry.tiles").forEach(function (b) { masonry(b, cols); });
    document.querySelectorAll(".masonry.cards").forEach(function (b) { masonry(b, w < 560 ? 1 : w < 1000 ? 2 : 3); });
    document.querySelectorAll(".hero-collage").forEach(function (b) { masonry(b, w < 560 ? 2 : w < 1000 ? 3 : 4); });
  }
  // Thumbnails fade in as they arrive.
  function fadeIn(root) {
    root.querySelectorAll(".masonry img").forEach(function (img) {
      if (img.complete && img.naturalWidth) img.classList.add("loaded");
      else img.addEventListener("load", function () { img.classList.add("loaded"); }, { once: true });
    });
  }
  var t;
  window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(layout, 120); });
  layout();
  fadeIn(document);

  // Viewer
  var dataEl = document.getElementById("album-data");
  if (!dataEl) return;
  var album = JSON.parse(dataEl.textContent), items = album.items, cur = -1;
  var v = document.createElement("div");
  v.className = "viewer";
  v.innerHTML = '<div class="count"></div><div class="stage"></div>' +
    '<button class="close" aria-label="Close">&times;</button>' +
    '<button class="prev" aria-label="Previous">&#8249;</button><button class="next" aria-label="Next">&#8250;</button>' +
    '<button class="play" aria-label="Play slideshow">Play</button>' +
    '<a class="dl" download>Download original</a>';
  document.body.appendChild(v);
  var stage = v.querySelector(".stage"), count = v.querySelector(".count"), dl = v.querySelector(".dl");
  var playBtn = v.querySelector(".play");

  // Slideshow: a photo every 5 seconds, videos play to the end; loops.
  var PHOTO_SECONDS = 5, playing = false, timer = null, wake = null;
  function schedule() {
    clearTimeout(timer);
    if (!playing || cur < 0) return;
    var it = items[cur];
    if (it.type === "video") {
      var vid = stage.querySelector("video.in") || stage.querySelector("video");
      if (vid) { vid.onended = function () { if (playing) show((cur + 1) % items.length); }; return; }
    }
    timer = setTimeout(function () { show((cur + 1) % items.length); }, PHOTO_SECONDS * 1000);
  }
  function setPlaying(on) {
    playing = on;
    v.classList.toggle("playing", on);
    playBtn.textContent = on ? "Pause" : "Play";
    playBtn.setAttribute("aria-label", on ? "Pause slideshow" : "Play slideshow");
    if (on) {
      if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (w) { wake = w; }).catch(function () {});
      schedule();
    } else {
      clearTimeout(timer);
      if (wake) { wake.release(); wake = null; }
    }
  }
  playBtn.addEventListener("click", function (e) { e.stopPropagation(); setPlaying(!playing); });
  var startBtn = document.querySelector(".slideshow-btn");
  if (startBtn) startBtn.addEventListener("click", function () {
    if (v.requestFullscreen && window.innerWidth > 700) v.requestFullscreen().catch(function () {});
    show(0); setPlaying(true);
  });

  function show(i) {
    if (i < 0 || i >= items.length) return;
    cur = i;
    var it = items[i];
    // Cross-fade: the new photo fades in over the old one, which then goes.
    var olds = Array.prototype.slice.call(stage.children);
    olds.forEach(function (o) {
      o.classList.remove("in");
      if (o.pause) o.pause();
      setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 450);
    });
    var el;
    if (it.type === "video") {
      el = document.createElement("video");
      el.src = "../../" + it.video; el.poster = "../../" + it.l;
      el.controls = true; el.playsInline = true; el.autoplay = true;
    } else {
      el = document.createElement("img");
      el.src = "../../" + it.l; el.alt = "";
    }
    stage.appendChild(el);
    var reveal = function () { requestAnimationFrame(function () { el.classList.add("in"); }); };
    if (it.type === "video") reveal();
    else if (el.complete) reveal();
    else { el.onload = reveal; el.onerror = reveal; }
    count.textContent = (i + 1) + " / " + items.length;
    dl.href = "https://github.com/" + album.repo + "/releases/download/" + album.slug + "/" + it.orig;
    v.classList.add("open");
    if (playing) setTimeout(schedule, 0);
    document.documentElement.style.overflow = "hidden";
    if (location.hash !== "#" + (i + 1)) history.replaceState(null, "", "#" + (i + 1));
    [i - 1, i + 1].forEach(function (j) {
      if (items[j] && items[j].type === "photo") { var p = new Image(); p.src = "../../" + items[j].l; }
    });
  }
  function close() {
    setPlaying(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    v.classList.remove("open"); cur = -1;
    setTimeout(function () { if (cur < 0) stage.innerHTML = ""; }, 300);
    document.documentElement.style.overflow = "";
    history.replaceState(null, "", location.pathname);
  }
  document.querySelectorAll(".tile").forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); show(+a.dataset.i); });
  });
  v.querySelector(".close").onclick = close;
  v.querySelector(".prev").onclick = function () { show(cur - 1); };
  v.querySelector(".next").onclick = function () { show(cur + 1); };
  stage.addEventListener("click", function (e) { if (e.target === stage) close(); });
  document.addEventListener("keydown", function (e) {
    if (cur < 0) return;
    if (e.key === "ArrowRight") show(cur + 1);
    else if (e.key === "ArrowLeft") show(cur - 1);
    else if (e.key === "Escape") close();
    else if (e.key === " ") { e.preventDefault(); setPlaying(!playing); }
  });
  var x0 = null, y0 = null;
  v.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  v.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(cur + (dx < 0 ? 1 : -1));
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) close();
    x0 = null;
  });
  var m = location.hash.match(/^#(\d+)$/);
  if (m) show(+m[1] - 1);
})();
