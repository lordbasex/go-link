<!-- Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> -->
# Concept screens

The sources of `site/img/meet.webp`, `store.webp` and `terminal.webp`: how
go-link Meet, Store and Terminal are planned to look, drawn with go-link
Desk's tokens and fonts. Each page is 1200 × 750. To capture one again
(Chrome and cwebp):

```bash
chrome --headless=new --hide-scrollbars --allow-file-access-from-files \
  --force-device-scale-factor=2 --window-size=1200,750 \
  --screenshot=meet.png "file://$PWD/meet.html"
cwebp -q 82 -resize 1200 0 meet.png -o ../../site/img/meet.webp
```
