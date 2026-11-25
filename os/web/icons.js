/* Butter icon set: Fluent-inspired (rounded 1.75px strokes, soft duotone fills) with a dinosaur flavour.
   One <symbol> sprite, used as <svg class="ic"><use href="#i-egg"/></svg>. Colours follow currentColor. */
(function () {
  var S = 'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
  var F = 'fill="none"';
  var gear = (function () { // 8-tooth gear outline built at load, so the file stays small
    var p = "", n = 8, ro = 9.2, ri = 7.2;
    for (var i = 0; i < n * 2; i++) {
      var a0 = (i * Math.PI) / n - Math.PI / (n * 4), a1 = a0 + Math.PI / (n * 2);
      var r = i % 2 ? ri : ro, aa = [a0 + (Math.PI / n) * 0, a1];
      aa.forEach(function (a, j) { p += (p ? "L" : "M") + (12 + r * Math.cos(a)).toFixed(2) + " " + (12 + r * Math.sin(a)).toFixed(2); });
    }
    return p + "Z";
  })();
  var I = {
    nest: '<path d="M3 13.5c.5 4.2 4.2 7 9 7s8.5-2.8 9-7z" ' + F + ' ' + S + '/><path d="M5.5 16.2c4 1.4 9 1.4 13 0M8 19c2.6.8 5.4.8 8 0" ' + S + ' fill="none"/><path d="M12 3.3c-2.1 0-3.7 3-3.7 5.9A3.7 3.7 0 0 0 12 13a3.7 3.7 0 0 0 3.7-3.8C15.7 6.3 14.1 3.3 12 3.3z" ' + F + ' ' + S + '/>',
    egg: '<path d="M12 2.8c-3.8 0-6.7 5.6-6.7 10A6.7 6.7 0 0 0 12 19.5a6.7 6.7 0 0 0 6.7-6.7c0-4.4-2.9-10-6.7-10z" ' + F + ' ' + S + '/><path d="M9.2 13.2l1.4-1.6 1.4 1.6 1.5-1.6 1.3 1.4" ' + S + ' fill="none"/><circle cx="9.5" cy="9" r=".8" fill="currentColor"/><circle cx="14.6" cy="8" r=".7" fill="currentColor"/><path d="M8 21.2h8" ' + S + '/>',
    footprint: '<path d="M12 20.5V6.5M12 20.5L5.2 10M12 20.5L18.8 10" ' + S + ' fill="none"/><path d="M12 6.5l-1-3.2M5.2 10L2.8 8.2M18.8 10l2.4-1.8" ' + S + ' fill="none"/><circle cx="12" cy="18.2" r="3" ' + F + ' ' + S + '/>',
    bone: '<g transform="rotate(-45 12 12)"><path d="M7.63 10.5H16.37A2.4 2.4 0 1 1 18.6 12A2.4 2.4 0 1 1 16.37 13.5H7.63A2.4 2.4 0 1 1 5.4 12A2.4 2.4 0 1 1 7.63 10.5Z" ' + F + ' ' + S + ' transform="translate(.8 0) scale(.96 1) translate(.5 0)"/></g>',
    fossil: '<circle cx="12" cy="12" r="9.2" ' + F + ' ' + S + '/><path d="M12 12a1.6 1.6 0 0 1 3.2 0 3.6 3.6 0 0 1-7.2 0 5.6 5.6 0 0 1 11.2 0" ' + S + ' fill="none"/><path d="M18.6 6l1.6-1M20.6 9l1.8-.4M19.4 17.4l1.7 1M16.5 20.3l.7 1.8" ' + S + ' fill="none" opacity=".6"/>',
    volcano: '<path d="M2.8 20.5L8.6 9.6h6.8l5.8 10.9z" ' + F + ' ' + S + '/><path d="M8.6 9.6l1.3 2.6 2.1-1.8 2.1 1.8 1.3-2.6" ' + S + ' fill="none"/><path d="M10 6.6c-1.2-1.4-.6-2.6.4-3.2M14 6.2c-.9-1.2-.3-2.2.7-2.8" ' + S + ' fill="none" opacity=".75"/><path d="M12 14v3.4" ' + S + '/>',
    fern: '<path d="M12 21.5V3.2" ' + S + '/><path d="M12 18.2c-3.4.2-5.7-1.3-6.5-4 3.4-.3 5.9 1.1 6.5 4zM12 18.2c3.4.2 5.7-1.3 6.5-4-3.4-.3-5.9 1.1-6.5 4zM12 13c-3-.1-5-1.5-5.6-3.9 3 -.2 5.1 1.2 5.6 3.9zM12 13c3-.1 5-1.5 5.6-3.9-3-.2-5.1 1.2-5.6 3.9zM12 8.2c-2-.2-3.3-1.3-3.8-3 2-.1 3.4.9 3.8 3zM12 8.2c2-.2 3.3-1.3 3.8-3-2-.1-3.4.9-3.8 3z" ' + F + ' ' + S + '/>',
    meteor: '<circle cx="15.6" cy="8.4" r="5" ' + F + ' ' + S + '/><circle cx="14.2" cy="7.4" r=".9" fill="currentColor"/><circle cx="17" cy="10" r=".7" fill="currentColor"/><path d="M11.6 12.4L3.4 20.6M10 8.4L4.6 13.8M15.4 14L10 19.4" ' + S + ' fill="none"/>',
    claw: '<path d="M4.2 20.8c-.7-7 2.2-13.4 9-17.2-1.2 5.2-1.2 11.2.1 17.2z" ' + F + ' ' + S + '/><path d="M14.4 20.8c-.4-4 .8-8 5.8-11.6.4 4-.4 8-2 11.6z" ' + F + ' ' + S + '/><path d="M8.2 12.6c.4 2.4.4 5 0 8" ' + S + ' fill="none" opacity=".6"/>',
    fang: '<path d="M4.5 3.8h15c.2 6-2 12.4-7.5 17-5.5-4.6-7.7-11-7.5-17z" ' + F + ' ' + S + '/><path d="M9 7.4c.2 3 1.2 5.6 3 8" ' + S + ' fill="none" opacity=".6"/>',
    crown: '<path d="M3.4 18.6h17.2l1-11-5.1 4.4L12 5.2 7.5 12 2.4 7.6z" ' + F + ' ' + S + '/><path d="M3.4 21h17.2" ' + S + '/>',
    heartbeat: '<path d="M12 20.6s-8.4-5-8.4-11.2a4.7 4.7 0 0 1 8.4-2.8 4.7 4.7 0 0 1 8.4 2.8c0 6.2-8.4 11.2-8.4 11.2z" ' + F + ' ' + S + '/><path d="M5.5 12.2h3.3l1.7-3.2 3 6 1.6-2.8h3.4" ' + S + ' fill="none"/>',
    coin: '<circle cx="12" cy="12" r="9" ' + F + ' ' + S + '/><circle cx="12" cy="12" r="6" ' + S + ' fill="none" opacity=".5"/><path d="M12 7.6v8.8M14.3 9.6c-.5-.9-1.3-1.3-2.3-1.3-1.4 0-2.4.7-2.4 1.8s.9 1.5 2.4 1.9 2.4.8 2.4 1.9-1 1.8-2.4 1.8c-1 0-1.9-.5-2.4-1.4" ' + S + ' fill="none"/>',
    gear: '<path d="' + gear + '" ' + F + ' ' + S + '/><circle cx="12" cy="12" r="3.1" ' + S + ' fill="none"/>',
    server: '<rect x="3" y="4" width="18" height="6.5" rx="2" ' + F + ' ' + S + '/><rect x="3" y="13.5" width="18" height="6.5" rx="2" ' + F + ' ' + S + '/><path d="M7 7.2h.01M7 16.8h.01M11 7.2h6M11 16.8h6" ' + S + '/>',
    play: '<path d="M7 4.6v14.8a1 1 0 0 0 1.5.9l12-7.4a1 1 0 0 0 0-1.8l-12-7.4A1 1 0 0 0 7 4.6z" transform="translate(-1.6 0) scale(.95 1)" ' + F + ' ' + S + '/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="3" ' + F + ' ' + S + '/>',
    restart: '<path d="M20 12a8 8 0 1 1-2.6-5.9" ' + S + ' fill="none"/><path d="M20 3.8v4.6h-4.6" ' + S + ' fill="none"/>',
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" ' + F + ' ' + S + '/><path d="M15.5 8.5V6.5A2.5 2.5 0 0 0 13 4H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5h2" ' + S + ' fill="none"/>',
    check: '<path d="M4.5 12.8l4.8 4.8L19.5 7" ' + S + ' fill="none"/>',
    x: '<path d="M6 6l12 12M18 6L6 18" ' + S + ' fill="none"/>',
    plus: '<path d="M12 5v14M5 12h14" ' + S + ' fill="none"/>',
    minus: '<path d="M5 12h14" ' + S + ' fill="none"/>',
    trash: '<path d="M5.5 7.5l1 11.2A2 2 0 0 0 8.5 20.5h7a2 2 0 0 0 2-1.8l1-11.2z" ' + F + ' ' + S + '/><path d="M4 7.5h16M9.5 7.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2.5M10 11.5v5M14 11.5v5" ' + S + ' fill="none"/>',
    download: '<path d="M12 3.8v12M7 11.5l5 5 5-5M4.5 20.2h15" ' + S + ' fill="none"/>',
    upload: '<path d="M12 16.2v-12M7 8.8l5-5 5 5M4.5 20.2h15" ' + S + ' fill="none"/>',
    folder: '<path d="M3 7.2A2.2 2.2 0 0 1 5.2 5h3.6c.6 0 1.1.2 1.5.7l1 1.1c.3.4.9.6 1.4.6h6.1A2.2 2.2 0 0 1 21 9.6v7.2a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 16.8z" ' + F + ' ' + S + '/>',
    file: '<path d="M6.5 3h6.8L19 8.7v10.3a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" ' + F + ' ' + S + '/><path d="M13 3.2V9h5.8M8 13h8M8 16.4h5" ' + S + ' fill="none"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" ' + S + ' fill="none"/>',
    globe: '<circle cx="12" cy="12" r="9" ' + F + ' ' + S + '/><path d="M3.2 12h17.6M12 3c2.6 2.6 3.6 5.6 3.6 9s-1 6.4-3.6 9c-2.6-2.6-3.6-5.6-3.6-9S9.400 5.600 12 3z" ' + S + ' fill="none"/>',
    terminal: '<rect x="2.8" y="4.5" width="18.4" height="15" rx="3" ' + F + ' ' + S + '/><path d="M7 9.5l3 2.6-3 2.6M12.5 15h4.5" ' + S + ' fill="none"/>',
    back: '<path d="M19 12H5M11 5.5L4.5 12l6.5 6.5" ' + S + ' fill="none"/>',
    next: '<path d="M5 12h14M13 5.5l6.5 6.5-6.5 6.5" ' + S + ' fill="none"/>',
    chevron: '<path d="M9 5.5l6.500 6.500L9 18.500" ' + S + ' fill="none"/>',
    warn: '<path d="M10.3 4.2L2.8 17.4A2 2 0 0 0 4.5 20.400h15a2 2 0 0 0 1.7-3L13.700 4.200a2 2 0 0 0-3.400 0z" ' + F + ' ' + S + '/><path d="M12 9.500v4.200M12 17h.01" ' + S + ' fill="none"/>',
    info: '<circle cx="12" cy="12" r="9" ' + F + ' ' + S + '/><path d="M12 11v5.500M12 7.700h.01" ' + S + ' fill="none"/>',
    save: '<path d="M5.500 3.500h10.200L20.500 8.300v10.200a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z" ' + F + ' ' + S + '/><path d="M7.500 3.500v5h7v-5M7.500 20.500v-6.500h9v6.500" ' + S + ' fill="none"/>',
    edit: '<path d="M4 20l1-4.200L16.300 4.500a2 2 0 0 1 2.800 0l.4.400a2 2 0 0 1 0 2.800L8.200 19z" ' + F + ' ' + S + '/><path d="M14.500 6.500l3 3" ' + S + ' fill="none"/>',
    wifi: '<path d="M2.800 9.300a13 13 0 0 1 18.400 0M5.800 12.600a8.700 8.700 0 0 1 12.400 0M8.800 15.800a4.300 4.300 0 0 1 6.400 0" ' + S + ' fill="none"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/>',
    shield: '<path d="M12 3l7.500 2.700v5.800c0 4.500-3.100 8.200-7.500 9.700-4.400-1.500-7.500-5.200-7.500-9.700V5.700z" ' + F + ' ' + S + '/><path d="M8.800 12l2.300 2.300 4.200-4.600" ' + S + ' fill="none"/>',
    user: '<circle cx="12" cy="8" r="3.800" ' + F + ' ' + S + '/><path d="M4.500 20.200c.8-3.800 3.700-5.700 7.500-5.700s6.700 1.900 7.500 5.700" ' + S + ' fill="none"/>',
    clock: '<circle cx="12" cy="12" r="9" ' + F + ' ' + S + '/><path d="M12 7v5.200l3.400 2" ' + S + ' fill="none"/>',
    sun: '<circle cx="12" cy="12" r="4" ' + F + ' ' + S + '/><path d="M12 2.800v2M12 19.200v2M2.800 12h2M19.200 12h2M5.500 5.500l1.400 1.400M17.100 17.100l1.400 1.400M18.500 5.500l-1.400 1.400M6.900 17.100l-1.400 1.400" ' + S + ' fill="none"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.300 0 1.900-.9 1.500-1.900-.4-1 .1-2.100 1.200-2.100H17a4 4 0 0 0 4-4C21 6.700 17 3 12 3z" ' + F + ' ' + S + '/><circle cx="7.800" cy="11" r="1" fill="currentColor"/><circle cx="10.600" cy="7.400" r="1" fill="currentColor"/><circle cx="15" cy="7.800" r="1" fill="currentColor"/>',
    cursor: '<path d="M5 3.500l13 8.400-5.600 1.500 3.200 5.600-2.500 1.400-3.200-5.600L5.500 18.500z" ' + F + ' ' + S + '/>',
    list: '<path d="M8.500 6.500H20M8.500 12H20M8.500 17.500H20M4 6.500h.01M4 12h.01M4 17.500h.01" ' + S + ' fill="none"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2.500" ' + F + ' ' + S + '/><rect x="9.500" y="9.500" width="5" height="5" rx="1" ' + S + ' fill="none"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" ' + S + ' fill="none"/>',
    disk: '<ellipse cx="12" cy="6.500" rx="8" ry="3" ' + F + ' ' + S + '/><path d="M4 6.500v11c0 1.700 3.600 3 8 3s8-1.300 8-3v-11M4 12c0 1.700 3.600 3 8 3s8-1.300 8-3" ' + S + ' fill="none"/>'
  };
  // plain, widely recognised outline icons (replace the old dino-flavoured ones)
  var P = function (d) { return '<path d="' + d + '" ' + S + ' fill="none"/>'; };
  I.nest = P("M3 11l9-7.5 9 7.5M5.5 9.5V20h13V9.5M10 20v-6h4v6");
  I.egg = P("M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9");
  I.footprint = '<circle cx="9" cy="8" r="3.2" ' + S + ' fill="none"/>' + P("M3 20c.5-3.600 3-5.500 6-5.500s5.500 1.900 6 5.500") + '<circle cx="17" cy="9" r="2.600" ' + S + ' fill="none"/>' + P("M17 14.200c2.400.2 3.900 1.800 4.300 4.300");
  I.bone = I.folder;
  I.fossil = '<rect x="3" y="4" width="18" height="5" rx="1.500" ' + S + ' fill="none"/>' + P("M5 9v9.500A1.500 1.500 0 0 0 6.500 20h11a1.500 1.500 0 0 0 1.500-1.500V9M10 13h4");
  I.volcano = P("M4 7h10M18 7h2M4 17h4M12 17h8") + '<circle cx="16" cy="7" r="2" ' + S + ' fill="none"/><circle cx="10" cy="17" r="2" ' + S + ' fill="none"/>';
  I.fern = P("M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4");
  I.meteor = I.warn;
  I.claw = P("M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H10");
  I.fang = '<circle cx="12" cy="12" r="9" ' + S + ' fill="none"/>' + P("M5.600 5.600l12.800 12.800");
  I.crown = P("M4 18l-1-10 5 4 4-7 4 7 5-4-1 10zM5 21h14");
  I.heartbeat = P("M3 12h4l3-8 4 16 3-8h4");
  I.coin = '<circle cx="12" cy="12" r="9" ' + S + ' fill="none"/>' + P("M14.500 9.500c-.4-1-1.300-1.500-2.500-1.500-1.500 0-2.500.8-2.500 2s1 1.600 2.500 2 2.500.8 2.500 2-1 2-2.500 2c-1.300 0-2.200-.6-2.600-1.600M12 6.500V8M12 16v1.500");
  // friendly mascot: own geometric design, colours via --d1 (body) / --d2 (belly+plates) so it follows the theme
  var mascot = '<symbol id="i-dino" viewBox="0 0 64 64"><path d="M6 46c6 2 9-3 11-8l2 8z" fill="var(--d2,#2fa36b)" stroke="var(--dino-line,#14122b)" stroke-width="2.600" stroke-linejoin="round"/>' +
    '<path d="M24 14l3-6 3 5 3-6 3 6 3-5 3 6z" fill="var(--d2,#2fa36b)" stroke="var(--dino-line,#14122b)" stroke-width="2.200" stroke-linejoin="round" transform="translate(-6 8) scale(.9)"/>' +
    '<path d="M14 40c0-12 8-18 20-18h6c4-1 8 1 10 5 3 1 5 4 5 8v3c0 8-6 13-13 13H29c-8 0-15-4-15-11z" fill="var(--d1,#7be0a0)" stroke="var(--dino-line,#14122b)" stroke-width="2.600" stroke-linejoin="round"/>' +
    '<path d="M24 52v6M44 52v6" stroke="var(--dino-line,#14122b)" stroke-width="5.500" stroke-linecap="round"/><path d="M24 52v6M44 52v6" stroke="var(--d1,#7be0a0)" stroke-width="2.200" stroke-linecap="round"/>' +
    '<path d="M30 44c0 6 4 8 9 8s9-3 9-8z" fill="#fff6dc" fill-opacity=".85"/>' +
    '<circle cx="48" cy="30" r="3.200" fill="var(--dino-line,#14122b)"/><circle cx="49.200" cy="28.800" r="1.100" fill="#fff"/>' +
    '<path d="M52 38.500c2.200.8 4.400.4 6-1" fill="none" stroke="var(--dino-line,#14122b)" stroke-width="2.200" stroke-linecap="round"/>' +
    '<circle cx="57.800" cy="30.200" r="1.100" fill="var(--dino-line,#14122b)"/><circle cx="40" cy="36" r="2" fill="var(--d2,#2fa36b)" opacity=".5"/><circle cx="34" cy="31" r="1.500" fill="var(--d2,#2fa36b)" opacity=".5"/></symbol>';
  var out = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' + mascot;
  for (var k in I) out += '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + I[k] + '</symbol>';
  out += "</defs></svg>";
  window.BICONS = Object.keys(I).concat(["dino"]);
  function put() { document.body.insertAdjacentHTML("afterbegin", out); }
  if (document.body) put(); else document.addEventListener("DOMContentLoaded", put);
})();
