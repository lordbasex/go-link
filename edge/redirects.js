// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The CDN edge function that runs on every request to go-link.org.
// go-link.org is the index of the projects; before 2026-10-11 it was the
// game site, now at console.go-link.org. The index serves its own files, and
// any other path goes to console with its query.

var OWN = { "/": 1, "/index.html": 1, "/style.css": 1, "/favicon.svg": 1, "/i18n.js": 1, "/theme.js": 1, "/analytics.js": 1, "/robots.txt": 1 };
// Folders that are the page's own too: its screenshots and its fonts.
var OWN_DIRS = ["/img/", "/fonts/"];

function own(uri) {
  if (OWN[uri]) return true;
  for (var i = 0; i < OWN_DIRS.length; i++) {
    if (uri.indexOf(OWN_DIRS[i]) === 0) return true;
  }
  return false;
}

function query(qs) {
  var parts = [];
  for (var key in qs) {
    var v = qs[key];
    if (v.multiValue) {
      for (var i = 0; i < v.multiValue.length; i++) parts.push(key + "=" + v.multiValue[i].value);
    } else {
      parts.push(v.value === "" ? key : key + "=" + v.value);
    }
  }
  return parts.length ? "?" + parts.join("&") : "";
}

function moved(location) {
  return { statusCode: 301, statusDescription: "Moved Permanently", headers: { location: { value: location } } };
}

function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : "";
  var uri = request.uri;
  if (host === "www.go-link.org") return moved("https://go-link.org" + uri + query(request.querystring));
  if (own(uri)) return request;
  return moved("https://console.go-link.org" + uri + query(request.querystring));
}
