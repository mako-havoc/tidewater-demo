/* Tidewater Goods: flat SVG product illustrations, drawn in code (no image files, no copyrighted art).
   TWArt.svg(type, [main, accent], {premium, label}) returns an <svg> string on a 200 x 200 canvas. */
(function () {
  "use strict";

  var uid = 0;

  function hex(c) {
    c = String(c || "#888888").replace("#", "");
    if (c.length === 3) c = c.replace(/(.)/g, "$1$1");
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }
  function mix(a, b, t) {
    var x = hex(a), y = hex(b);
    return "#" + [0, 1, 2].map(function (i) {
      return ("0" + Math.round(x[i] + (y[i] - x[i]) * t).toString(16)).slice(-2);
    }).join("");
  }
  var INK = "#16343b";
  function shade(c) { return mix(c, INK, 0.28); }
  function light(c) { return mix(c, "#ffffff", 0.45); }

  // Each drawer gets (m = main colour, a = accent, id = unique prefix) and returns SVG markup.
  var D = {
    towel: function (m, a) {
      var s = "";
      for (var i = 0; i < 3; i++) {
        var y = 120 - i * 26;
        s += '<rect x="44" y="' + y + '" width="112" height="28" rx="10" fill="' + (i % 2 ? a : m) + '"/>' +
             '<rect x="44" y="' + (y + 9) + '" width="112" height="6" fill="' + (i % 2 ? m : a) + '" opacity=".9"/>' +
             '<path d="M150 ' + (y + 2) + 'q8 12 0 24" stroke="' + shade(i % 2 ? a : m) + '" stroke-width="3" fill="none"/>';
      }
      return s;
    },
    blanket: function (m, a, id) {
      return '<defs><pattern id="' + id + 'c" width="20" height="20" patternUnits="userSpaceOnUse">' +
             '<rect width="20" height="20" fill="' + a + '"/><rect width="10" height="20" fill="' + m + '" opacity=".75"/>' +
             '<rect width="20" height="10" fill="' + m + '" opacity=".55"/></pattern></defs>' +
             '<rect x="40" y="70" width="120" height="70" rx="14" fill="url(#' + id + 'c)"/>' +
             '<rect x="40" y="70" width="120" height="70" rx="14" fill="none" stroke="' + shade(m) + '" stroke-width="3"/>' +
             '<rect x="92" y="62" width="16" height="86" rx="4" fill="' + INK + '" opacity=".85"/>' +
             '<path d="M100 62 C100 38 132 38 132 62" stroke="' + INK + '" stroke-width="6" fill="none" stroke-linecap="round"/>';
    },
    tote: function (m, a) {
      var rope = mix(a, "#c8a46a", .5);
      return '<path d="M70 80 C70 26 130 26 130 80" stroke="' + rope + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
             '<path d="M70 80 C70 26 130 26 130 80" stroke="' + light(rope) + '" stroke-width="2" fill="none" stroke-dasharray="3 5" opacity=".7"/>' +
             '<path d="M46 76 H154 L146 160 H54 Z" fill="' + m + '"/>' +
             '<rect x="64" y="74" width="12" height="16" rx="3" fill="' + rope + '"/><rect x="124" y="74" width="12" height="16" rx="3" fill="' + rope + '"/>' +
             '<path d="M46 76 H154 L153 88 H47 Z" fill="' + shade(m) + '" opacity=".35"/>' +
             '<path d="M70 118 q15 -14 30 0 t30 0" stroke="' + a + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
             '<path d="M70 134 q15 -14 30 0 t30 0" stroke="' + a + '" stroke-width="5" fill="none" stroke-linecap="round" opacity=".6"/>';
    },
    mesh: function (m, a, id) {
      return '<defs><pattern id="' + id + 'm" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
             '<rect width="14" height="14" fill="none"/><path d="M0 0 V14 M0 0 H14" stroke="' + m + '" stroke-width="3"/></pattern></defs>' +
             '<path d="M70 74 C70 42 130 42 130 74" stroke="' + a + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
             '<path d="M52 72 H148 C150 120 140 158 100 160 C60 158 50 120 52 72 Z" fill="' + light(m) + '" opacity=".35"/>' +
             '<path d="M52 72 H148 C150 120 140 158 100 160 C60 158 50 120 52 72 Z" fill="url(#' + id + 'm)"/>' +
             '<rect x="50" y="66" width="100" height="12" rx="6" fill="' + a + '"/>';
    },
    cooler: function (m, a) {
      return '<path d="M58 72 C58 46 142 46 142 72" stroke="' + INK + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
             '<rect x="44" y="70" width="112" height="86" rx="14" fill="' + m + '"/>' +
             '<rect x="44" y="70" width="112" height="24" rx="12" fill="' + shade(m) + '"/>' +
             '<rect x="62" y="108" width="76" height="34" rx="8" fill="' + a + '"/>' +
             '<path d="M74 125 h52" stroke="' + light(a) + '" stroke-width="4" stroke-linecap="round"/>';
    },
    drybag: function (m, a) {
      // roll-top dry bag: rolled band with folds, side clips, wide body
      return '<path d="M60 70 Q58 160 70 164 H130 Q142 160 140 70 Z" fill="' + m + '"/>' +
             '<rect x="54" y="48" width="92" height="26" rx="11" fill="' + shade(m) + '"/>' +
             '<path d="M58 56 H142 M58 64 H142" stroke="' + m + '" stroke-width="2" opacity=".7"/>' +
             '<rect x="40" y="52" width="18" height="16" rx="4" fill="' + INK + '"/><rect x="142" y="52" width="18" height="16" rx="4" fill="' + INK + '"/>' +
             '<path d="M49 68 Q44 96 60 104 M151 68 Q156 96 140 104" stroke="' + INK + '" stroke-width="4" fill="none" stroke-linecap="round"/>' +
             '<rect x="60" y="104" width="80" height="22" fill="' + a + '"/>' +
             '<path d="M76 115 h48" stroke="' + m + '" stroke-width="3" stroke-linecap="round" stroke-dasharray="6 6"/>' +
             '<path d="M70 80 Q68 140 76 154" stroke="' + light(m) + '" stroke-width="6" fill="none" opacity=".45" stroke-linecap="round"/>';
    },
    bucket: function (m, a) {
      return '<path d="M70 60 Q100 46 130 60 L138 112 H62 Z" fill="' + m + '"/>' +
             '<path d="M62 106 H138 L138 118 H62 Z" fill="' + a + '"/>' +
             '<path d="M62 116 Q100 112 138 116 L162 146 Q100 156 38 146 Z" fill="' + shade(m) + '"/>' +
             '<path d="M70 60 Q100 46 130 60" stroke="' + light(m) + '" stroke-width="4" fill="none"/>' +
             '<path d="M66 120 Q66 168 90 170" stroke="' + INK + '" stroke-width="2" fill="none" opacity=".6"/>';
    },
    cap: function (m, a) {
      return '<path d="M52 118 C52 66 148 66 148 118 Z" fill="' + m + '"/>' +
             '<path d="M100 72 V118" stroke="' + shade(m) + '" stroke-width="3"/>' +
             '<circle cx="100" cy="70" r="6" fill="' + a + '"/>' +
             '<path d="M100 110 C126 108 166 112 172 128 C150 136 114 132 100 124 Z" fill="' + shade(m) + '"/>' +
             '<rect x="52" y="112" width="96" height="10" rx="5" fill="' + a + '"/>';
    },
    sunhat: function (m, a) {
      return '<ellipse cx="100" cy="124" rx="78" ry="26" fill="' + m + '"/>' +
             '<ellipse cx="100" cy="124" rx="78" ry="26" fill="none" stroke="' + shade(m) + '" stroke-width="3" stroke-dasharray="2 6"/>' +
             '<path d="M64 120 C64 70 136 70 136 120 Z" fill="' + light(m) + '"/>' +
             '<path d="M64 106 H136 V118 H64 Z" fill="' + a + '"/>' +
             '<path d="M136 112 l18 16 l-6 6 z" fill="' + a + '"/>';
    },
    legionnaire: function (m, a) {
      return '<path d="M58 120 C58 72 142 72 142 120 Z" fill="' + m + '"/>' +
             '<path d="M58 116 H142 V158 Q120 150 100 158 Q80 150 58 158 Z" fill="' + a + '" opacity=".95"/>' +
             '<path d="M58 116 H142 V158 Q120 150 100 158 Q80 150 58 158 Z" fill="none" stroke="' + shade(a) + '" stroke-width="2"/>' +
             '<path d="M126 112 C150 112 170 116 174 128 C156 132 136 128 124 122 Z" fill="' + shade(m) + '"/>';
    },
    bottle: function (m, a) {
      return '<rect x="74" y="58" width="52" height="108" rx="20" fill="' + m + '"/>' +
             '<rect x="84" y="36" width="32" height="26" rx="8" fill="' + INK + '"/>' +
             '<path d="M92 36 C92 24 108 24 108 36" stroke="' + INK + '" stroke-width="5" fill="none"/>' +
             '<rect x="74" y="98" width="52" height="24" fill="' + a + '"/>' +
             '<rect x="82" y="66" width="7" height="90" rx="3.5" fill="' + light(m) + '" opacity=".55"/>';
    },
    tumbler: function (m, a) {
      return '<path d="M112 26 L104 66" stroke="' + a + '" stroke-width="6" stroke-linecap="round"/>' +
             '<rect x="62" y="58" width="76" height="16" rx="6" fill="' + INK + '"/>' +
             '<path d="M66 74 H134 L124 162 H76 Z" fill="' + m + '"/>' +
             '<path d="M69 100 H131 L129 120 H71 Z" fill="' + a + '"/>' +
             '<path d="M78 80 L84 156" stroke="' + light(m) + '" stroke-width="6" stroke-linecap="round" opacity=".55"/>';
    },
    kidsbottle: function (m, a) {
      return '<rect x="70" y="78" width="60" height="84" rx="22" fill="' + m + '"/>' +
             '<rect x="78" y="58" width="44" height="24" rx="8" fill="' + a + '"/>' +
             '<path d="M108 58 L118 40 L126 44 L118 60" fill="' + a + '"/>' +
             '<circle cx="100" cy="120" r="16" fill="' + light(m) + '" opacity=".7"/>' +
             '<path d="M90 117 q10 10 20 0" stroke="' + a + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
    },
    mug: function (m, a) {
      var dots = "";
      [[78, 92], [96, 110], [116, 88], [86, 132], [120, 126], [104, 142], [70, 116]].forEach(function (p) {
        dots += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4" fill="' + a + '" opacity=".55"/>';
      });
      return '<path d="M134 88 C164 88 164 136 134 136" stroke="' + m + '" stroke-width="12" fill="none"/>' +
             '<path d="M134 88 C164 88 164 136 134 136" stroke="' + shade(m) + '" stroke-width="2" fill="none" opacity=".4"/>' +
             '<rect x="56" y="70" width="82" height="88" rx="10" fill="' + m + '"/>' +
             '<ellipse cx="97" cy="72" rx="41" ry="8" fill="' + a + '"/>' + dots +
             '<path d="M66 72 V150" stroke="' + light(m) + '" stroke-width="6" opacity=".4"/>';
    },
    tin: function (m, a) {
      return '<ellipse cx="100" cy="132" rx="62" ry="22" fill="' + shade(m) + '"/>' +
             '<rect x="38" y="104" width="124" height="28" fill="' + shade(m) + '"/>' +
             '<ellipse cx="100" cy="104" rx="62" ry="22" fill="' + m + '"/>' +
             '<ellipse cx="100" cy="104" rx="40" ry="13" fill="' + a + '"/>' +
             '<path d="M78 104 q11 -9 22 0 t22 0" stroke="' + m + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
    },
    stick: function (m, a) {
      return '<rect x="80" y="40" width="40" height="40" rx="10" fill="' + a + '" stroke="' + shade(a) + '" stroke-width="2"/>' +
             '<rect x="78" y="76" width="44" height="92" rx="10" fill="' + m + '"/>' +
             '<rect x="78" y="138" width="44" height="14" fill="' + shade(m) + '"/>' +
             '<rect x="86" y="86" width="6" height="46" rx="3" fill="' + light(m) + '" opacity=".6"/>';
    },
    tube: function (m, a) {
      return '<path d="M70 40 H130 L122 140 H78 Z" fill="' + a + '" stroke="' + shade(m) + '" stroke-width="2"/>' +
             '<path d="M70 40 H130 V50 H70 Z" fill="' + shade(m) + '"/>' +
             '<path d="M80 72 H120 L116 112 H84 Z" fill="' + m + '"/>' +
             '<rect x="84" y="140" width="32" height="26" rx="6" fill="' + m + '"/>';
    },
    balm: function (m, a) {
      return '<rect x="84" y="46" width="32" height="40" rx="9" fill="' + a + '" stroke="' + shade(m) + '" stroke-width="2"/>' +
             '<rect x="82" y="84" width="36" height="78" rx="9" fill="' + m + '"/>' +
             '<path d="M82 110 H118" stroke="' + a + '" stroke-width="5"/>' +
             '<rect x="89" y="92" width="5" height="60" rx="2.5" fill="' + light(m) + '" opacity=".6"/>';
    },
    candle: function (m, a) {
      return D.tin(m, a) +
             '<path d="M100 98 V84" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>' +
             '<path d="M100 52 C112 66 110 82 100 84 C90 82 88 66 100 52 Z" fill="#f2b33d"/>' +
             '<path d="M100 64 C105 71 104 79 100 80 C96 79 95 71 100 64 Z" fill="#fff4cf"/>';
    },
    chalk: function (m, a) {
      var s = "", cols = [m, a, mix(m, "#7bb6d9", .5)];
      [[-18, 60], [0, 48], [18, 60]].forEach(function (p, i) {
        var x = 100 + p[0];
        s += '<g transform="rotate(' + (p[0] / 2) + ' ' + x + ' 150)">' +
             '<rect x="' + (x - 11) + '" y="' + p[1] + '" width="22" height="' + (164 - p[1]) + '" rx="10" fill="' + cols[i] + '"/>' +
             '<rect x="' + (x - 11) + '" y="' + p[1] + '" width="22" height="16" rx="10" fill="' + light(cols[i]) + '"/>' +
             '<rect x="' + (x - 6) + '" y="' + (p[1] + 24) + '" width="4" height="' + (120 - p[1]) + '" rx="2" fill="#ffffff" opacity=".35"/></g>';
      });
      return s;
    },
    bubbles: function (m, a) {
      return '<rect x="66" y="84" width="40" height="80" rx="10" fill="' + m + '"/>' +
             '<rect x="66" y="74" width="40" height="16" rx="5" fill="' + shade(m) + '"/>' +
             '<rect x="72" y="112" width="28" height="22" rx="4" fill="' + a + '"/>' +
             '<path d="M100 76 L128 48" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>' +
             '<circle cx="136" cy="40" r="11" fill="none" stroke="' + INK + '" stroke-width="4"/>' +
             '<circle cx="152" cy="80" r="14" fill="' + light(m) + '" opacity=".55" stroke="#ffffff" stroke-width="2"/>' +
             '<circle cx="132" cy="110" r="9" fill="' + light(a) + '" opacity=".6" stroke="#ffffff" stroke-width="2"/>' +
             '<circle cx="160" cy="124" r="6" fill="' + light(m) + '" opacity=".6" stroke="#ffffff" stroke-width="1.5"/>';
    },
    crayon: function (m, a) {
      return '<g transform="rotate(-35 100 100)">' +
             '<path d="M84 52 L100 22 L116 52 Z" fill="' + m + '"/>' +
             '<rect x="84" y="52" width="32" height="118" rx="4" fill="' + m + '"/>' +
             '<rect x="84" y="70" width="32" height="76" fill="' + a + '"/>' +
             '<path d="M84 80 H116 M84 136 H116" stroke="' + m + '" stroke-width="3"/>' +
             '<path d="M92 96 q8 8 16 0 M92 112 q8 8 16 0" stroke="' + m + '" stroke-width="3" fill="none" stroke-linecap="round"/></g>';
    },
    umbrella: function (m, a) {
      var s = '<path d="M100 60 L104 176" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/>';
      var segs = 6;
      for (var i = 0; i < segs; i++) {
        var x0 = 30 + i * (140 / segs), x1 = 30 + (i + 1) * (140 / segs);
        s += '<path d="M100 40 L' + x0 + ' 100 Q' + ((x0 + x1) / 2) + ' 90 ' + x1 + ' 100 Z" fill="' + (i % 2 ? a : m) + '"/>';
      }
      return s + '<circle cx="100" cy="38" r="5" fill="' + INK + '"/>';
    },
    chair: function (m, a) {
      return '<path d="M56 164 L94 96 M144 164 L106 96 M60 132 H140" stroke="' + mix(m, INK, .55) + '" stroke-width="6" stroke-linecap="round"/>' +
             '<path d="M70 52 H130 L140 132 H60 Z" fill="' + m + '"/>' +
             '<path d="M70 52 H130 L132 72 H68 Z" fill="' + a + '" opacity=".9"/>' +
             '<path d="M66 92 H134" stroke="' + a + '" stroke-width="6" opacity=".9"/>' +
             '<path d="M70 52 L60 132 M130 52 L140 132" stroke="' + mix(m, INK, .55) + '" stroke-width="6" stroke-linecap="round"/>';
    },
    pail: function (m, a) {
      return '<path d="M60 84 C60 40 140 40 140 84" stroke="' + INK + '" stroke-width="4" fill="none"/>' +
             '<path d="M54 82 H146 L134 160 H66 Z" fill="' + m + '"/>' +
             '<rect x="52" y="78" width="96" height="12" rx="6" fill="' + shade(m) + '"/>' +
             '<path d="M150 64 L132 140" stroke="' + a + '" stroke-width="6" stroke-linecap="round"/>' +
             '<path d="M126 136 L140 140 L136 166 Q126 168 122 158 Z" fill="' + a + '"/>' +
             '<path d="M78 118 l8 -12 l8 12 l8 -12 l8 12 l8 -12 l8 12" stroke="' + light(m) + '" stroke-width="4" fill="none"/>';
    },
    mask: function (m, a) {
      return '<path d="M30 104 C30 92 170 92 170 104" stroke="' + INK + '" stroke-width="6" fill="none"/>' +
             '<rect x="50" y="80" width="100" height="56" rx="24" fill="' + m + '"/>' +
             '<rect x="58" y="88" width="38" height="40" rx="14" fill="' + light(a) + '"/>' +
             '<rect x="104" y="88" width="38" height="40" rx="14" fill="' + light(a) + '"/>' +
             '<path d="M64 96 l10 -4 M110 96 l10 -4" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity=".8"/>' +
             '<path d="M154 140 V60 Q154 44 168 44" stroke="' + a + '" stroke-width="10" fill="none" stroke-linecap="round"/>' +
             '<path d="M150 140 Q150 156 136 156" stroke="' + a + '" stroke-width="10" fill="none" stroke-linecap="round"/>';
    },
    surfboard: function (m, a) {
      return '<g transform="rotate(-30 100 100)">' +
             '<path d="M100 20 C130 50 134 150 100 182 C66 150 70 50 100 20 Z" fill="' + m + '"/>' +
             '<path d="M100 26 V176" stroke="' + a + '" stroke-width="4"/>' +
             '<path d="M100 150 l-10 18 h20 z" fill="' + INK + '" opacity=".7"/></g>';
    },
    wetsuit: function (m, a) {
      // full wetsuit on a hanger: long sleeves, chest panel, back-zip leash
      return '<path d="M100 22 v10 M84 38 Q100 26 116 38" stroke="' + INK + '" stroke-width="4" fill="none" stroke-linecap="round"/>' +
             '<path d="M84 40 H116 L142 52 L158 116 L146 120 L130 72 L128 112 L126 176 H106 L100 122 L94 176 H74 L72 112 L70 72 L54 120 L42 116 L58 52 Z" fill="' + INK + '"/>' +
             '<path d="M84 40 H116 L122 46 L120 92 H80 L78 46 Z" fill="' + m + '"/>' +
             '<path d="M84 40 Q100 52 116 40" stroke="' + a + '" stroke-width="4" fill="none"/>' +
             '<path d="M145 104 L158 116 M55 104 L42 116" stroke="' + m + '" stroke-width="6" stroke-linecap="round"/>' +
             '<path d="M100 54 V120" stroke="' + a + '" stroke-width="2" stroke-dasharray="3 3"/>' +
             '<path d="M100 120 Q112 140 104 158" stroke="' + a + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
    }
  };

  function svg(type, colors, opts) {
    opts = opts || {};
    var m = (colors && colors[0]) || "#2f7d86";
    var a = (colors && colors[1]) || "#f7efe2";
    var id = "tw" + (++uid);
    var draw = D[type] || D.tote;
    var bg = mix(m, "#ffffff", 0.82);
    var badge = opts.premium
      ? '<g transform="translate(150 26)"><circle r="17" fill="#d9a441"/><path d="M0 -9 L2.6 -2.8 L9.4 -2.8 L3.9 1.3 L5.9 7.8 L0 4 L-5.9 7.8 L-3.9 1.3 L-9.4 -2.8 L-2.6 -2.8 Z" fill="#ffffff"/></g>'
      : "";
    var label = opts.label ? ' role="img" aria-label="' + String(opts.label).replace(/[&<>"]/g, "") + '"' : ' aria-hidden="true" focusable="false"';
    return '<svg class="tw-art" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"' + label + '>' +
           '<circle cx="100" cy="100" r="92" fill="' + bg + '"/>' +
           '<ellipse cx="100" cy="176" rx="58" ry="8" fill="' + INK + '" opacity=".10"/>' +
           draw(m, a, id) + badge + "</svg>";
  }

  window.TWArt = { svg: svg, types: Object.keys(D), mix: mix };
})();
