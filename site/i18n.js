// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The page's texts in English (default), Spanish and Portuguese. The HTML
// carries the English ones, so the page reads well without this script.
(function () {
  var TEXTS = {
    "en": {
      "title": "go-link projects",
      "projects": "Projects",
      "legend": "Legend",
      "sections": "Sections",
      "scroll": "See the projects",
      "navProjects": "Projects",
      "navHow": "How it works",
      "navPrinciples": "Principles",
      "eyebrow": "Open source · WebRTC",
      "heroTitle": "One link, people connected directly.",
      "heroLead": "go-link is a family of apps that join two or more people browser to browser: games, remote desktop, calls, files and terminals. They meet on one signaling server; after that, everything travels straight between them.",
      "hub": "Project ecosystem",
      "hubSub": "Everything over WebRTC",
      "console": "Arcade video game console to play with friends",
      "desk": "Remote desktop: help or work on another computer",
      "meet": "Video calls in the browser",
      "store": "Send files directly between two computers",
      "terminal": "SSH terminal from the browser",
      "live": "Available",
      "work": "In progress",
      "soon": "Coming soon",
      "projectsEyebrow": "The projects",
      "projectsTitle": "One ecosystem, five ways to connect",
      "projectsLead": "Each project is its own app and its own site, with the same idea underneath: your computer and your friends' browsers talk directly.",
      "consoleText": "Your computer becomes the arcade: it runs the games and streams them live. Friends join with a link and a PIN, from any browser or the phone app.",
      "consoleF1": "Up to four players, an arcade queue and spectators",
      "consoleF2": "Voice chat between players, gamepads and touch controls",
      "consoleF3": "MAME arcade games and go-link HD games",
      "consoleOpen": "Open Console",
      "deskText": "Remote desktop: see another computer's screen and use it with your mouse and keyboard from the browser, to help someone or to reach your own machine. Always with its owner's permission.",
      "deskF1": "The screen streamed live, with mouse and keyboard",
      "deskF2": "The owner approves every session",
      "deskF3": "Nothing to install on the side that connects",
      "meetText": "Video calls between people, with a link and nothing to install: camera, microphone and screen sharing straight from the browser.",
      "meetF1": "Rooms with a link and a PIN",
      "meetF2": "Camera, voice and screen sharing",
      "meetF3": "Video and voice go straight between people",
      "storeText": "Send and receive files between two computers: browse the folder the other person shares and move files straight between you, of any size.",
      "storeF1": "Two panes: your files and theirs",
      "storeF2": "Large files, checked when they arrive",
      "storeF3": "No upload to a cloud in the middle",
      "terminalText": "An SSH-style terminal to another computer, from the browser: reach a machine behind a home router without opening ports.",
      "terminalF1": "A real shell in the browser",
      "terminalF2": "No open ports on the remote computer",
      "terminalF3": "Access only with the owner's approval",
      "howEyebrow": "How it works",
      "howTitle": "Meet once, then talk directly",
      "step1Title": "Open the app",
      "step1Text": "The host runs the project's app on their computer, or opens its page.",
      "step2Title": "Share a link",
      "step2Text": "Friends get a link, a code or a QR. The signaling server only introduces them, like a doorman.",
      "step3Title": "Connect directly",
      "step3Text": "WebRTC links the browsers: picture, sound, input and files travel encrypted, straight between them.",
      "principlesEyebrow": "Principles",
      "principlesTitle": "Built to be yours",
      "p1Title": "Open source",
      "p1Text": "Every project is MIT licensed and public on GitHub.",
      "p2Title": "Private by design",
      "p2Text": "Your data goes straight between people, encrypted; no server in the middle keeps it.",
      "p3Title": "Just a browser",
      "p3Text": "Guests need nothing but a modern browser, on a computer or a phone.",
      "p4Title": "Your own server",
      "p4Text": "The signaling server, signalhub, is open too: run your own whenever you want.",
      "footAbout": "Open-source apps that connect people directly over WebRTC.",
      "footProjects": "Projects",
      "footCode": "Code",
      "foot": "Open source, MIT license. Every project meets on one signaling server; after that, people connect directly over WebRTC."
    },
    "es": {
      "title": "Proyectos de go-link",
      "projects": "Proyectos",
      "legend": "Referencias",
      "sections": "Secciones",
      "scroll": "Ver los proyectos",
      "navProjects": "Proyectos",
      "navHow": "Cómo funciona",
      "navPrinciples": "Principios",
      "eyebrow": "Código abierto · WebRTC",
      "heroTitle": "Un link, personas conectadas directo.",
      "heroLead": "go-link es una familia de apps que unen a dos o más personas de navegador a navegador: juegos, escritorio remoto, llamadas, archivos y terminales. Se encuentran en un servidor de señalización; después, todo viaja directo entre ellas.",
      "hub": "Ecosistema de proyectos",
      "hubSub": "Todo por WebRTC",
      "console": "Consola arcade de videojuegos para jugar con amigos",
      "desk": "Escritorio remoto: ayuda o trabaja en otra computadora",
      "meet": "Videollamadas en el navegador",
      "store": "Envía archivos directo entre dos computadoras",
      "terminal": "Terminal SSH desde el navegador",
      "live": "Disponible",
      "work": "En desarrollo",
      "soon": "Próximamente",
      "projectsEyebrow": "Los proyectos",
      "projectsTitle": "Un ecosistema, cinco formas de conectarse",
      "projectsLead": "Cada proyecto es su propia app y su propio sitio, con la misma idea de fondo: tu computadora y los navegadores de tus amigos se hablan directo.",
      "consoleText": "Tu computadora se convierte en el arcade: corre los juegos y los transmite en vivo. Tus amigos entran con un link y un PIN, desde cualquier navegador o la app del teléfono.",
      "consoleF1": "Hasta cuatro jugadores, fila de arcade y espectadores",
      "consoleF2": "Chat de voz entre jugadores, joysticks y controles táctiles",
      "consoleF3": "Juegos arcade de MAME y juegos go-link HD",
      "consoleOpen": "Abrir Console",
      "deskText": "Escritorio remoto: mira la pantalla de otra computadora y úsala con tu mouse y teclado desde el navegador, para dar soporte a alguien o llegar a tu propia máquina. Siempre con permiso de su dueño.",
      "deskF1": "La pantalla en vivo, con mouse y teclado",
      "deskF2": "El dueño aprueba cada sesión",
      "deskF3": "Nada que instalar del lado que se conecta",
      "meetText": "Videollamadas entre personas, con un link y sin instalar nada: cámara, micrófono y pantalla compartida directo desde el navegador.",
      "meetF1": "Salas con un link y un PIN",
      "meetF2": "Cámara, voz y pantalla compartida",
      "meetF3": "El video y la voz van directo entre las personas",
      "storeText": "Envía y recibe archivos entre dos computadoras: recorre la carpeta que comparte la otra persona y mueve archivos directo entre ustedes, del tamaño que sean.",
      "storeF1": "Dos paneles: tus archivos y los suyos",
      "storeF2": "Archivos grandes, verificados al llegar",
      "storeF3": "Sin subir nada a una nube en el medio",
      "terminalText": "Una terminal estilo SSH hacia otra computadora, desde el navegador: llega a una máquina detrás del router de casa sin abrir puertos.",
      "terminalF1": "Una shell real en el navegador",
      "terminalF2": "Sin puertos abiertos en la computadora remota",
      "terminalF3": "Acceso solo con la aprobación del dueño",
      "howEyebrow": "Cómo funciona",
      "howTitle": "Se encuentran una vez y después hablan directo",
      "step1Title": "Abre la app",
      "step1Text": "El anfitrión corre la app del proyecto en su computadora, o abre su página.",
      "step2Title": "Comparte un link",
      "step2Text": "Tus amigos reciben un link, un código o un QR. El servidor de señalización solo los presenta, como un portero.",
      "step3Title": "Conexión directa",
      "step3Text": "WebRTC une los navegadores: imagen, sonido, controles y archivos viajan cifrados, directo entre ellos.",
      "principlesEyebrow": "Principios",
      "principlesTitle": "Hecho para que sea tuyo",
      "p1Title": "Código abierto",
      "p1Text": "Todos los proyectos tienen licencia MIT y son públicos en GitHub.",
      "p2Title": "Privado por diseño",
      "p2Text": "Tus datos van directo entre las personas, cifrados; ningún servidor en el medio los guarda.",
      "p3Title": "Solo un navegador",
      "p3Text": "Los invitados no necesitan más que un navegador moderno, en una computadora o un teléfono.",
      "p4Title": "Tu propio servidor",
      "p4Text": "El servidor de señalización, signalhub, también es abierto: corre el tuyo cuando quieras.",
      "footAbout": "Apps de código abierto que conectan personas directo por WebRTC.",
      "footProjects": "Proyectos",
      "footCode": "Código",
      "foot": "Código abierto, licencia MIT. Todos los proyectos se encuentran en un servidor de señalización; después, las personas se conectan directo por WebRTC."
    },
    "pt": {
      "title": "Projetos do go-link",
      "projects": "Projetos",
      "legend": "Legenda",
      "sections": "Seções",
      "scroll": "Ver os projetos",
      "navProjects": "Projetos",
      "navHow": "Como funciona",
      "navPrinciples": "Princípios",
      "eyebrow": "Código aberto · WebRTC",
      "heroTitle": "Um link, pessoas conectadas direto.",
      "heroLead": "O go-link é uma família de apps que unem duas ou mais pessoas de navegador a navegador: jogos, área de trabalho remota, chamadas, arquivos e terminais. Elas se encontram em um servidor de sinalização; depois, tudo viaja direto entre elas.",
      "hub": "Ecossistema de projetos",
      "hubSub": "Tudo por WebRTC",
      "console": "Console arcade de videogame para jogar com os amigos",
      "desk": "Área de trabalho remota: ajude ou trabalhe em outro computador",
      "meet": "Videochamadas no navegador",
      "store": "Envie arquivos direto entre dois computadores",
      "terminal": "Terminal SSH pelo navegador",
      "live": "Disponível",
      "work": "Em desenvolvimento",
      "soon": "Em breve",
      "projectsEyebrow": "Os projetos",
      "projectsTitle": "Um ecossistema, cinco formas de se conectar",
      "projectsLead": "Cada projeto é o seu próprio app e o seu próprio site, com a mesma ideia por trás: o seu computador e os navegadores dos seus amigos conversam direto.",
      "consoleText": "O seu computador vira o fliperama: roda os jogos e os transmite ao vivo. Os amigos entram com um link e um PIN, de qualquer navegador ou do app do celular.",
      "consoleF1": "Até quatro jogadores, fila de fliperama e espectadores",
      "consoleF2": "Chat de voz entre jogadores, controles e controles na tela",
      "consoleF3": "Jogos arcade do MAME e jogos go-link HD",
      "consoleOpen": "Abrir o Console",
      "deskText": "Área de trabalho remota: veja a tela de outro computador e use-a com o seu mouse e teclado pelo navegador, para dar suporte a alguém ou acessar a sua própria máquina. Sempre com a permissão do dono.",
      "deskF1": "A tela ao vivo, com mouse e teclado",
      "deskF2": "O dono aprova cada sessão",
      "deskF3": "Nada para instalar do lado que se conecta",
      "meetText": "Videochamadas entre pessoas, com um link e sem instalar nada: câmera, microfone e compartilhamento de tela direto do navegador.",
      "meetF1": "Salas com um link e um PIN",
      "meetF2": "Câmera, voz e compartilhamento de tela",
      "meetF3": "O vídeo e a voz vão direto entre as pessoas",
      "storeText": "Envie e receba arquivos entre dois computadores: navegue pela pasta que a outra pessoa compartilha e mova arquivos direto entre vocês, de qualquer tamanho.",
      "storeF1": "Dois painéis: os seus arquivos e os dele",
      "storeF2": "Arquivos grandes, conferidos ao chegar",
      "storeF3": "Sem enviar nada para uma nuvem no meio",
      "terminalText": "Um terminal estilo SSH para outro computador, pelo navegador: chegue a uma máquina atrás do roteador de casa sem abrir portas.",
      "terminalF1": "Um shell de verdade no navegador",
      "terminalF2": "Sem portas abertas no computador remoto",
      "terminalF3": "Acesso só com a aprovação do dono",
      "howEyebrow": "Como funciona",
      "howTitle": "Elas se encontram uma vez e depois conversam direto",
      "step1Title": "Abra o app",
      "step1Text": "O anfitrião roda o app do projeto no computador dele, ou abre a página.",
      "step2Title": "Compartilhe um link",
      "step2Text": "Os amigos recebem um link, um código ou um QR. O servidor de sinalização só os apresenta, como um porteiro.",
      "step3Title": "Conexão direta",
      "step3Text": "O WebRTC liga os navegadores: imagem, som, controles e arquivos viajam criptografados, direto entre eles.",
      "principlesEyebrow": "Princípios",
      "principlesTitle": "Feito para ser seu",
      "p1Title": "Código aberto",
      "p1Text": "Todos os projetos têm licença MIT e são públicos no GitHub.",
      "p2Title": "Privado por design",
      "p2Text": "Os seus dados vão direto entre as pessoas, criptografados; nenhum servidor no meio os guarda.",
      "p3Title": "Só um navegador",
      "p3Text": "Os convidados só precisam de um navegador moderno, no computador ou no celular.",
      "p4Title": "O seu próprio servidor",
      "p4Text": "O servidor de sinalização, signalhub, também é aberto: rode o seu quando quiser.",
      "footAbout": "Apps de código aberto que conectam pessoas direto por WebRTC.",
      "footProjects": "Projetos",
      "footCode": "Código",
      "foot": "Código aberto, licença MIT. Todos os projetos se encontram em um servidor de sinalização; depois, as pessoas se conectam direto por WebRTC."
    }
  };
  var KEY = "go-link.lang";

  function saved() {
    try {
      var v = localStorage.getItem(KEY);
      return TEXTS[v] ? v : null;
    } catch (e) {
      return null;
    }
  }

  function apply(lang) {
    var t = TEXTS[lang] || TEXTS.en;
    document.documentElement.lang = lang;
    document.title = lang === "en" ? "go-link" : "go-link · " + t.hub;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t[el.getAttribute("data-i18n")];
    });
    document.querySelectorAll("[data-i18n-label]").forEach(function (el) {
      el.setAttribute("aria-label", t[el.getAttribute("data-i18n-label")]);
    });
    document.querySelectorAll("[data-lang]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang));
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    // English unless the visitor picked another language here before.
    var lang = saved() || "en";
    if (lang !== "en") apply(lang);
    document.querySelectorAll("[data-lang]").forEach(function (b) {
      b.addEventListener("click", function () {
        var l = b.getAttribute("data-lang");
        apply(l);
        try {
          localStorage.setItem(KEY, l);
        } catch (e) {
          // blocked storage: the choice lasts until the page closes
        }
      });
    });
  });
})();
