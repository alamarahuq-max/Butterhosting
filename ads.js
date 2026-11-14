/* Ads: nothing is shown or loaded until you fill BUTTER_ADS in config.js with your AdSense IDs. Empty slots are removed, never left as blank boxes. */
(function () {
  var A = window.BUTTER_ADS || {}, boxes = document.querySelectorAll("[data-ad]");
  if (!A.client) { boxes.forEach(function (b) { b.remove(); }); return; }
  var s = document.createElement("script");
  s.async = true; s.crossOrigin = "anonymous";
  s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(A.client);
  document.head.appendChild(s);
  boxes.forEach(function (b) {
    var slot = (A.slots || {})[b.getAttribute("data-ad")];
    if (!slot) { b.remove(); return; }
    b.hidden = false;
    var ins = document.createElement("ins");
    ins.className = "adsbygoogle"; ins.style.display = "block";
    ins.setAttribute("data-ad-client", A.client); ins.setAttribute("data-ad-slot", slot);
    ins.setAttribute("data-ad-format", "auto"); ins.setAttribute("data-full-width-responsive", "true");
    b.appendChild(ins);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  });
})();
