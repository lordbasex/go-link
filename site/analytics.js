// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Google Analytics 4, only with the visitor's consent. Nothing from Google
// loads until they press Accept; the choice is remembered here
// (go-link.consent) and "Cookie settings" in the footer asks again.
// Rejecting after accepting stops it and deletes its cookies.
(function () {
  var ID = "G-MGF9L3YHVB";
  var KEY = "go-link.consent";
  var loaded = false;

  function choice() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function remember(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {
      // blocked storage: the choice lasts until the page closes
    }
  }

  function load() {
    window["ga-disable-" + ID] = false;
    if (loaded) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", ID);
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + ID;
    document.head.appendChild(s);
  }

  function stop() {
    window["ga-disable-" + ID] = true;
    // Google's cookies (_ga, _ga_<id>) live on the site and on go-link.org.
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (name.indexOf("_ga") !== 0) return;
      ["", "; domain=go-link.org", "; domain=.go-link.org"].forEach(function (domain) {
        document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + domain;
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var banner = document.getElementById("consent");
    if (choice() === "granted") load();
    else if (choice() !== "denied" && banner) banner.hidden = false;

    document.querySelectorAll("[data-consent]").forEach(function (b) {
      b.addEventListener("click", function () {
        var value = b.getAttribute("data-consent");
        remember(value);
        if (value === "granted") load();
        else stop();
        banner.hidden = true;
      });
    });
    document.querySelectorAll("[data-consent-open]").forEach(function (b) {
      b.addEventListener("click", function () {
        banner.hidden = false;
        banner.querySelector('[data-consent="granted"]').focus();
      });
    });
  });
})();
