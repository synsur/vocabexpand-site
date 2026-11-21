/* VocabExpand site script. It does one thing: when a way to say a word is tapped, it lights that way's
   stressed syllable and plays its beat, a strike per syllable (and, on a narrow window, keeps a slim copy
   of the word's tiles in view so the lit syllable can be seen). It makes no network request and stores
   nothing: no cookies, no localStorage, no fetch. The pages read whole without it.

   The beat follows the app's plan (docs/design/prototype/index.html, beatPlan) and its sound recipe
   (docs/design/tokens.json, sound): a wooden bar, D5 for a quiet syllable and G5 for the stressed one,
   170 ms apart and 60 ms more after the stressed one. These are tile strikes, not a voice. */
(function () {
  'use strict';
  var doc = document, AC = window.AudioContext || window.webkitAudioContext, ctx = null, timers = [];
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  function beatPlan(say, nTiles, stressTile) {
    var parts = say.split('-'), strong = -1, plan = [], t0 = 0;
    parts.forEach(function (p, i) { if (/[A-Z]/.test(p) && p === p.toUpperCase()) strong = i; });
    var after = parts.length - 1 - strong;
    parts.forEach(function (p, i) {
      var tile;
      if (i < strong) tile = i;
      else if (i === strong) tile = stressTile - 1;
      else tile = nTiles - after + (i - strong - 1);
      if (tile < 0 || tile >= nTiles || (i !== strong && tile === stressTile - 1)) tile = null;
      plan.push({ t: t0, strong: i === strong, tile: tile });
      t0 += 170 + (i === strong ? 60 : 0);
    });
    return plan;
  }

  function strike(strong, at) {
    if (!ctx) return;
    var f = strong ? 783.99 : 587.33, decays = strong ? [0.046, 0.016, 0.008] : [0.030, 0.012, 0.006];
    var level = strong ? 0.5 : 0.5 * Math.pow(10, -9 / 20), out = ctx.createGain();
    out.gain.value = level; out.connect(ctx.destination);
    [1, 2.756, 5.404].forEach(function (m, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * m;
      g.gain.setValueAtTime([1, 0.5, 0.28][i], at);
      g.gain.setTargetAtTime(0, at, decays[i]);
      o.connect(g); g.connect(out); o.start(at); o.stop(at + (strong ? 0.18 : 0.12));
    });
    if (strong) {                       /* the thump under the strong strike */
      var o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine'; o2.frequency.value = 220;
      g2.gain.setValueAtTime(0.7, at); g2.gain.setTargetAtTime(0, at, 0.03);
      o2.connect(g2); g2.connect(out); o2.start(at); o2.stop(at + 0.18);
    } else {                            /* the click on a quiet one */
      var n = Math.floor(ctx.sampleRate * 0.012), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (var k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / n);
      var src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g3 = ctx.createGain();
      src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 3600; bp.Q.value = 1.2; g3.gain.value = 0.5;
      src.connect(bp); bp.connect(g3); g3.connect(out); src.start(at);
    }
  }

  function pulse(tile, strong) {
    tile.classList.remove('pulse', 'strong');
    void tile.offsetWidth;
    tile.classList.add('pulse'); if (strong) tile.classList.add('strong');
  }

  /* boxes: every row of tiles that shows this word (the big one, and the slim copy on a narrow window) */
  function perform(boxes, say, stressTile) {
    var sets = boxes.filter(Boolean).map(function (b) { return b.querySelectorAll('.tile'); });
    if (!sets.length) return;
    timers.forEach(clearTimeout); timers = [];
    if (AC) {
      try { ctx = ctx || new AC(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) { ctx = null; }
    }
    var t0 = ctx ? ctx.currentTime + 0.06 : 0, n = sets[0].length;
    boxes.forEach(function (b) { var p = b && b.closest('.perform'); if (p) p.classList.add('played'); });
    sets.forEach(function (tiles) {
      Array.prototype.forEach.call(tiles, function (x) { x.classList.remove('is-lit', 'is-quiet'); });
    });
    beatPlan(say, n, stressTile).forEach(function (s) {
      strike(s.strong, t0 + s.t / 1000);
      timers.push(setTimeout(function () {
        sets.forEach(function (tiles) {
          if (s.strong) Array.prototype.forEach.call(tiles, function (x, i) {
            x.classList.add(i === stressTile - 1 ? 'is-lit' : 'is-quiet');
          });
          if (s.tile !== null && tiles[s.tile]) pulse(tiles[s.tile], s.strong);
        });
      }, 60 + s.t));
    });
  }

  /* on a word's page, a slim copy of the tiles that stays in view once the word itself has scrolled away.
     It is a picture of the same word for the eye, so it is hidden from screen readers. */
  var head = doc.getElementById('head-tiles'), bar = null, barSay = null;
  if (head && 'IntersectionObserver' in window) {
    bar = doc.createElement('div'); bar.className = 'minibar stage'; bar.setAttribute('aria-hidden', 'true');
    var copy = head.cloneNode(true); copy.removeAttribute('id'); copy.removeAttribute('style');
    barSay = doc.createElement('span'); barSay.className = 'mb-say say';
    bar.appendChild(copy); bar.appendChild(barSay);
    ['--u', '--n'].forEach(function (k) { var v = head.parentNode.style.getPropertyValue(k); if (v) bar.style.setProperty(k, v); });
    doc.body.appendChild(bar);
    doc.documentElement.classList.add('has-minibar');
    new IntersectionObserver(function (es) {
      var e = es[es.length - 1];
      bar.classList.toggle('is-up', !e.isIntersecting && e.boundingClientRect.bottom < 1);
    }).observe(head);
  }

  /* a way to say the word: its respelling becomes a button */
  Array.prototype.forEach.call(doc.querySelectorAll('[data-way]'), function (way) {
    var say = way.querySelector('.say'), sel = way.getAttribute('data-tiles'), box = doc.querySelector(sel);
    if (!say || !box) return;
    var b = doc.createElement('button');
    b.type = 'button'; b.className = 'say'; b.innerHTML = '<span>' + say.innerHTML + '</span>';
    b.setAttribute('aria-pressed', way.classList.contains('is-on') ? 'true' : 'false');
    if (way.getAttribute('data-hint')) b.setAttribute('aria-describedby', way.getAttribute('data-hint'));
    say.parentNode.replaceChild(b, say);
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(doc.querySelectorAll('[data-way][data-tiles="' + sel + '"]'), function (w) {
        w.classList.toggle('is-on', w === way);
        var wb = w.querySelector('button.say'); if (wb) wb.setAttribute('aria-pressed', w === way ? 'true' : 'false');
      });
      var out = way.getAttribute('data-out') && doc.querySelector(way.getAttribute('data-out'));
      if (out) out.textContent = way.getAttribute('data-printed');
      var mine = box === head && bar;
      if (mine) barSay.innerHTML = b.firstChild.innerHTML;
      perform(mine ? [box, bar] : [box], way.getAttribute('data-say'), +way.getAttribute('data-stress'));
    });
  });
})();
