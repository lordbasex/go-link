// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The page's texts in English (default), Spanish and Portuguese, and the
// light/dark button. The HTML carries the English texts, so the page reads
// well without this script. Screenshots with words in them come in each
// language: data-src-lang holds their path with {lang}.
(function () {
  var TEXTS = {
    "en": {
      "title": "go-link",
      "sections": "Sections",
      "theme": "Light or dark theme",
      "language": "Language",
      "platforms": "Platforms",
      "navProjects": "Projects",
      "navNext": "Coming next",
      "navHow": "How it works",
      "navPrinciples": "Principles",
      "navCta": "See the projects",
      "eyebrow": "Open source · WebRTC",
      "heroA": "One link, people",
      "heroEm": "connected directly",
      "heroB": ".",
      "heroLead": "go-link is a family of apps that join two or more people browser to browser: games, remote desktop, calls, files and terminals. They meet on one signaling server; after that, everything travels straight between them.",
      "heroDesk": "Open Desk",
      "heroConsole": "Open Console",
      "note1": "Free and open source (MIT)",
      "note2": "Guests need only a browser",
      "note3": "Encrypted end to end",
      "orbitLabel": "The go-link projects",
      "hub": "Project ecosystem",
      "hubSub": "Everything over WebRTC",
      "live": "Available",
      "liveDesk": "Available · v1.1",
      "soon": "Coming soon",
      "soonShort": "Soon",
      "concept": "Concept",
      "browser": "Browser",
      "projectsEyebrow": "The projects",
      "projectsTitle": "One ecosystem, five ways to connect",
      "projectsLead": "Each project is its own app and its own site, with the same idea underneath: your computer and your friends' browsers talk directly.",
      "consoleAlt": "A go-link Console room in the browser: the game, the players' seats, the chat and the keyboard controls",
      "consolePhoneAlt": "The same room on a phone, with touch controls",
      "consoleText": "Your computer becomes the arcade: it runs the games and streams them live. Friends join with a link and a PIN, from any browser or the phone app.",
      "consoleF1": "Up to four players, an arcade queue and spectators",
      "consoleF2": "Voice chat between players, gamepads and touch controls",
      "consoleF3": "MAME arcade games and go-link HD games",
      "consoleOpen": "Open Console",
      "deskAlt": "A remote Mac in the browser with go-link Desk, with its toolbar on top",
      "deskPhoneAlt": "The same session on a phone held sideways",
      "deskText": "Remote desktop: see another computer's screen and use it with your mouse and keyboard from the browser, to help someone or to reach your own machine. Always with its owner's permission.",
      "deskF1": "A 9-digit code, and the owner approves every session",
      "deskF2": "Picture and sound live, mouse, keyboard, clipboard and files",
      "deskF3": "Nothing to install on the side that connects",
      "deskOpen": "Open Desk",
      "nextEyebrow": "Coming next",
      "nextTitle": "Three more on the way",
      "nextLead": "Calls, files and terminals, on the same base as Console and Desk. The screens are concept designs: how they are planned to look.",
      "meetAlt": "Concept of go-link Meet: a call with four people, one sharing their screen, and the chat",
      "meetText": "Video calls between people, with a link and nothing to install: camera, microphone and screen sharing straight from the browser.",
      "meetF1": "Rooms with a link and a PIN",
      "meetF2": "Camera, voice and screen sharing",
      "meetF3": "Video and voice go straight between people",
      "storeAlt": "Concept of go-link Store: this computer's files and a friend's shared folder side by side, with a file on its way",
      "storeText": "Send and receive files between two computers: browse the folder the other person shares and move files straight between you, of any size.",
      "storeF1": "Two panes: your files and theirs",
      "storeF2": "Large files, checked when they arrive",
      "storeF3": "No upload to a cloud in the middle",
      "terminalAlt": "Concept of go-link Terminal: a shell on a home server, in the browser",
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
      "p3Key": "0 installs",
      "p3Title": "Just a browser",
      "p3Text": "Guests need nothing but a modern browser, on a computer or a phone.",
      "p4Title": "Your own server",
      "p4Text": "The signaling server, signalhub, is open too: run your own whenever you want.",
      "diagram": "You and your friends connected directly; the signaling server only introduces you",
      "you": "You",
      "friends": "Your friends",
      "data": "picture · sound · input · files — encrypted",
      "hubNote": "signalhub: only introduces",
      "footAbout": "Open-source apps that connect people directly over WebRTC.",
      "footProjects": "Projects",
      "footCode": "Code",
      "footHelp": "Help",
      "footDeskDocs": "Desk documentation",
      "footConsoleDocs": "Console documentation",
      "footReport": "Report a problem",
      "footLicense": "MIT license",
      "cookieSettings": "Cookie settings",
      "consentTitle": "Cookies and statistics",
      "consentText": "go-link keeps no data about you. If you accept, Google Analytics counts your visit to this site with its cookies, so we know how many people come by; that data goes to Google. If you reject, nothing is loaded.",
      "consentReject": "Reject",
      "consentAccept": "Accept",
      "foot": "© 2026 go-link · Open source, MIT license. Every project meets on one signaling server; after that, people connect directly over WebRTC."
    },
    "es": {
      "title": "go-link · Ecosistema de proyectos",
      "sections": "Secciones",
      "theme": "Tema claro u oscuro",
      "language": "Idioma",
      "platforms": "Plataformas",
      "navProjects": "Proyectos",
      "navNext": "Lo que viene",
      "navHow": "Cómo funciona",
      "navPrinciples": "Principios",
      "navCta": "Ver los proyectos",
      "eyebrow": "Código abierto · WebRTC",
      "heroA": "Un link, personas",
      "heroEm": "conectadas directo",
      "heroB": ".",
      "heroLead": "go-link es una familia de apps que unen a dos o más personas de navegador a navegador: juegos, escritorio remoto, llamadas, archivos y terminales. Se encuentran en un servidor de señalización; después, todo viaja directo entre ellas.",
      "heroDesk": "Abrir Desk",
      "heroConsole": "Abrir Console",
      "note1": "Gratis y de código abierto (MIT)",
      "note2": "Los invitados solo necesitan un navegador",
      "note3": "Cifrado de punta a punta",
      "orbitLabel": "Los proyectos de go-link",
      "hub": "Ecosistema de proyectos",
      "hubSub": "Todo por WebRTC",
      "live": "Disponible",
      "liveDesk": "Disponible · v1.1",
      "soon": "Próximamente",
      "soonShort": "Pronto",
      "concept": "Concepto",
      "browser": "Navegador",
      "projectsEyebrow": "Los proyectos",
      "projectsTitle": "Un ecosistema, cinco formas de conectarse",
      "projectsLead": "Cada proyecto es su propia app y su propio sitio, con la misma idea de fondo: tu computadora y los navegadores de tus amigos se hablan directo.",
      "consoleAlt": "Una sala de go-link Console en el navegador: el juego, los lugares de los jugadores, el chat y los controles de teclado",
      "consolePhoneAlt": "La misma sala en un teléfono, con controles táctiles",
      "consoleText": "Tu computadora se convierte en el arcade: corre los juegos y los transmite en vivo. Tus amigos entran con un link y un PIN, desde cualquier navegador o la app del teléfono.",
      "consoleF1": "Hasta cuatro jugadores, fila de arcade y espectadores",
      "consoleF2": "Chat de voz entre jugadores, joysticks y controles táctiles",
      "consoleF3": "Juegos arcade de MAME y juegos go-link HD",
      "consoleOpen": "Abrir Console",
      "deskAlt": "Una Mac remota en el navegador con go-link Desk, con su barra de herramientas arriba",
      "deskPhoneAlt": "La misma sesión en un teléfono de costado",
      "deskText": "Escritorio remoto: mira la pantalla de otra computadora y úsala con tu mouse y teclado desde el navegador, para dar soporte a alguien o llegar a tu propia máquina. Siempre con permiso de su dueño.",
      "deskF1": "Un código de 9 dígitos, y el dueño aprueba cada sesión",
      "deskF2": "Imagen y sonido en vivo, mouse, teclado, portapapeles y archivos",
      "deskF3": "Nada que instalar del lado que se conecta",
      "deskOpen": "Abrir Desk",
      "nextEyebrow": "Lo que viene",
      "nextTitle": "Tres más en camino",
      "nextLead": "Llamadas, archivos y terminales, sobre la misma base que Console y Desk. Las pantallas son diseños de concepto: cómo se piensa que van a verse.",
      "meetAlt": "Concepto de go-link Meet: una llamada de cuatro personas, una compartiendo su pantalla, y el chat",
      "meetText": "Videollamadas entre personas, con un link y sin instalar nada: cámara, micrófono y pantalla compartida directo desde el navegador.",
      "meetF1": "Salas con un link y un PIN",
      "meetF2": "Cámara, voz y pantalla compartida",
      "meetF3": "El video y la voz van directo entre las personas",
      "storeAlt": "Concepto de go-link Store: los archivos de esta computadora y la carpeta compartida de un amigo lado a lado, con un archivo en camino",
      "storeText": "Envía y recibe archivos entre dos computadoras: recorre la carpeta que comparte la otra persona y mueve archivos directo entre ustedes, del tamaño que sean.",
      "storeF1": "Dos paneles: tus archivos y los suyos",
      "storeF2": "Archivos grandes, verificados al llegar",
      "storeF3": "Sin subir nada a una nube en el medio",
      "terminalAlt": "Concepto de go-link Terminal: una shell en un servidor de casa, en el navegador",
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
      "p3Key": "0 instalaciones",
      "p3Title": "Solo un navegador",
      "p3Text": "Los invitados no necesitan más que un navegador moderno, en una computadora o un teléfono.",
      "p4Title": "Tu propio servidor",
      "p4Text": "El servidor de señalización, signalhub, también es abierto: corre el tuyo cuando quieras.",
      "diagram": "Tú y tus amigos conectados directo; el servidor de señalización solo los presenta",
      "you": "Tú",
      "friends": "Tus amigos",
      "data": "imagen · sonido · controles · archivos — cifrados",
      "hubNote": "signalhub: solo presenta",
      "footAbout": "Apps de código abierto que conectan personas directo por WebRTC.",
      "footProjects": "Proyectos",
      "footCode": "Código",
      "footHelp": "Ayuda",
      "footDeskDocs": "Documentación de Desk",
      "footConsoleDocs": "Documentación de Console",
      "footReport": "Reportar un problema",
      "footLicense": "Licencia MIT",
      "cookieSettings": "Configurar cookies",
      "consentTitle": "Cookies y estadísticas",
      "consentText": "go-link no guarda ningún dato tuyo. Si aceptas, Google Analytics cuenta tu visita a este sitio con sus cookies, para saber cuánta gente viene; esos datos van a Google. Si rechazas, no se carga nada.",
      "consentReject": "Rechazar",
      "consentAccept": "Aceptar",
      "foot": "© 2026 go-link · Código abierto, licencia MIT. Todos los proyectos se encuentran en un servidor de señalización; después, las personas se conectan directo por WebRTC."
    },
    "pt": {
      "title": "go-link · Ecossistema de projetos",
      "sections": "Seções",
      "theme": "Tema claro ou escuro",
      "language": "Idioma",
      "platforms": "Plataformas",
      "navProjects": "Projetos",
      "navNext": "O que vem aí",
      "navHow": "Como funciona",
      "navPrinciples": "Princípios",
      "navCta": "Ver os projetos",
      "eyebrow": "Código aberto · WebRTC",
      "heroA": "Um link, pessoas",
      "heroEm": "conectadas direto",
      "heroB": ".",
      "heroLead": "O go-link é uma família de apps que unem duas ou mais pessoas de navegador a navegador: jogos, área de trabalho remota, chamadas, arquivos e terminais. Elas se encontram em um servidor de sinalização; depois, tudo viaja direto entre elas.",
      "heroDesk": "Abrir o Desk",
      "heroConsole": "Abrir o Console",
      "note1": "Gratuito e de código aberto (MIT)",
      "note2": "Os convidados só precisam de um navegador",
      "note3": "Criptografia de ponta a ponta",
      "orbitLabel": "Os projetos do go-link",
      "hub": "Ecossistema de projetos",
      "hubSub": "Tudo por WebRTC",
      "live": "Disponível",
      "liveDesk": "Disponível · v1.1",
      "soon": "Em breve",
      "soonShort": "Em breve",
      "concept": "Conceito",
      "browser": "Navegador",
      "projectsEyebrow": "Os projetos",
      "projectsTitle": "Um ecossistema, cinco formas de se conectar",
      "projectsLead": "Cada projeto é o seu próprio app e o seu próprio site, com a mesma ideia por trás: o seu computador e os navegadores dos seus amigos conversam direto.",
      "consoleAlt": "Uma sala do go-link Console no navegador: o jogo, os lugares dos jogadores, o chat e os controles de teclado",
      "consolePhoneAlt": "A mesma sala em um celular, com controles na tela",
      "consoleText": "O seu computador vira o fliperama: roda os jogos e os transmite ao vivo. Os amigos entram com um link e um PIN, de qualquer navegador ou do app do celular.",
      "consoleF1": "Até quatro jogadores, fila de fliperama e espectadores",
      "consoleF2": "Chat de voz entre jogadores, controles e controles na tela",
      "consoleF3": "Jogos arcade do MAME e jogos go-link HD",
      "consoleOpen": "Abrir o Console",
      "deskAlt": "Um Mac remoto no navegador com o go-link Desk, com a barra de ferramentas em cima",
      "deskPhoneAlt": "A mesma sessão em um celular deitado",
      "deskText": "Área de trabalho remota: veja a tela de outro computador e use-a com o seu mouse e teclado pelo navegador, para dar suporte a alguém ou acessar a sua própria máquina. Sempre com a permissão do dono.",
      "deskF1": "Um código de 9 dígitos, e o dono aprova cada sessão",
      "deskF2": "Imagem e som ao vivo, mouse, teclado, área de transferência e arquivos",
      "deskF3": "Nada para instalar do lado que se conecta",
      "deskOpen": "Abrir o Desk",
      "nextEyebrow": "O que vem aí",
      "nextTitle": "Mais três a caminho",
      "nextLead": "Chamadas, arquivos e terminais, sobre a mesma base do Console e do Desk. As telas são designs de conceito: como devem ficar.",
      "meetAlt": "Conceito do go-link Meet: uma chamada com quatro pessoas, uma compartilhando a tela, e o chat",
      "meetText": "Videochamadas entre pessoas, com um link e sem instalar nada: câmera, microfone e compartilhamento de tela direto do navegador.",
      "meetF1": "Salas com um link e um PIN",
      "meetF2": "Câmera, voz e compartilhamento de tela",
      "meetF3": "O vídeo e a voz vão direto entre as pessoas",
      "storeAlt": "Conceito do go-link Store: os arquivos deste computador e a pasta compartilhada de um amigo lado a lado, com um arquivo a caminho",
      "storeText": "Envie e receba arquivos entre dois computadores: navegue pela pasta que a outra pessoa compartilha e mova arquivos direto entre vocês, de qualquer tamanho.",
      "storeF1": "Dois painéis: os seus arquivos e os dele",
      "storeF2": "Arquivos grandes, conferidos ao chegar",
      "storeF3": "Sem enviar nada para uma nuvem no meio",
      "terminalAlt": "Conceito do go-link Terminal: um shell em um servidor de casa, no navegador",
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
      "p3Key": "0 instalações",
      "p3Title": "Só um navegador",
      "p3Text": "Os convidados só precisam de um navegador moderno, no computador ou no celular.",
      "p4Title": "O seu próprio servidor",
      "p4Text": "O servidor de sinalização, signalhub, também é aberto: rode o seu quando quiser.",
      "diagram": "Você e os seus amigos conectados direto; o servidor de sinalização só os apresenta",
      "you": "Você",
      "friends": "Os seus amigos",
      "data": "imagem · som · controles · arquivos — criptografados",
      "hubNote": "signalhub: só apresenta",
      "footAbout": "Apps de código aberto que conectam pessoas direto por WebRTC.",
      "footProjects": "Projetos",
      "footCode": "Código",
      "footHelp": "Ajuda",
      "footDeskDocs": "Documentação do Desk",
      "footConsoleDocs": "Documentação do Console",
      "footReport": "Relatar um problema",
      "footLicense": "Licença MIT",
      "cookieSettings": "Configurar cookies",
      "consentTitle": "Cookies e estatísticas",
      "consentText": "O go-link não guarda nenhum dado seu. Se você aceitar, o Google Analytics conta a sua visita a este site com os cookies dele, para sabermos quantas pessoas vêm; esses dados vão para o Google. Se recusar, nada é carregado.",
      "consentReject": "Recusar",
      "consentAccept": "Aceitar",
      "foot": "© 2026 go-link · Código aberto, licença MIT. Todos os projetos se encontram em um servidor de sinalização; depois, as pessoas se conectam direto por WebRTC."
    }
  };
  var KEY = "go-link.lang";
  var THEME = "go-link.theme";

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
    document.title = t.title;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t[el.getAttribute("data-i18n")];
    });
    document.querySelectorAll("[data-i18n-label]").forEach(function (el) {
      el.setAttribute("aria-label", t[el.getAttribute("data-i18n-label")]);
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
      el.setAttribute("alt", t[el.getAttribute("data-i18n-alt")]);
    });
    document.querySelectorAll("[data-src-lang]").forEach(function (el) {
      el.setAttribute("src", el.getAttribute("data-src-lang").replace("{lang}", lang));
    });
    document.querySelectorAll("[data-lang]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang));
    });
  }

  function setTheme(light) {
    var root = document.documentElement;
    if (light) root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    document.querySelector('meta[name="theme-color"]').setAttribute("content", light ? "#f3f4f7" : "#0e1016");
    try {
      localStorage.setItem(THEME, light ? "light" : "dark");
    } catch (e) {
      // blocked storage: the choice lasts until the page closes
    }
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
    var toggle = document.getElementById("theme");
    if (toggle) {
      toggle.addEventListener("click", function () {
        setTheme(document.documentElement.getAttribute("data-theme") !== "light");
      });
    }
  });
})();
