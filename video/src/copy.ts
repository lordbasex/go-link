// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import type { Lang } from "./timeline";

// The words on screen in each language. *Stars* mark the accent words.
// Spanish uses neutral "tú", Portuguese is Brazilian, as on the website.

export interface Copy {
  tagline: string;
  home: { title: string; sub: string };
  friends: { title: string; sub: string };
  invite: { title: string; chips: [string, string] };
  controls: { title: string; chips: [string, string, string] };
  phone: { title: string; sub: string };
  maker: { title: string; sub: string };
  metrics: { title: string; chips: [string, string, string] };
  end: { title: string; free: string };
}

const PLATFORMS = "macOS · Windows · Linux · Raspberry Pi";
export { PLATFORMS };

export const COPY: Record<Lang, Copy> = {
  en: {
    tagline: "Arcade nights, online.",
    home: { title: "Your games stay on *your* computer.", sub: "go-link runs MAME at home and streams it. Your ROMs never leave your disk." },
    friends: { title: "Friends play from the *browser.*", sub: "Nothing to install. A code, a PIN, and you're in." },
    invite: { title: "Invite with a link, a code or a *QR.*", chips: ["one PIN, one person", "private rooms"] },
    controls: { title: "Real controllers. *Real voice.*", chips: ["P1 · P2 · P3 · P4", "voice chat", "keyboard & gamepads"] },
    phone: { title: "Your phone becomes a *console.*", sub: "Held upright it's a handheld; sideways, both hands." },
    maker: { title: "Make your own *arcade games.*", sub: "Willy Maker builds a real ROM in the browser, and it plays in a room." },
    metrics: { title: "Every millisecond, *measured.*", chips: ["latency", "lost packets", "freezes explained"] },
    end: { title: "Play together, from *anywhere.*", free: "Free · open source (MIT)" },
  },
  es: {
    tagline: "Noches de arcade, online.",
    home: { title: "Tus juegos se quedan en *tu* computadora.", sub: "go-link corre MAME en tu casa y lo transmite. Tus ROMs nunca salen de tu disco." },
    friends: { title: "Tus amigos juegan desde el *navegador.*", sub: "Sin instalar nada. Un código, un PIN y listo." },
    invite: { title: "Invita con un enlace, un código o un *QR.*", chips: ["un PIN, una persona", "salas privadas"] },
    controls: { title: "Mandos reales. *Voz real.*", chips: ["P1 · P2 · P3 · P4", "chat de voz", "teclado y mandos"] },
    phone: { title: "Tu celular se convierte en una *consola.*", sub: "Vertical es una portátil; de costado, a dos manos." },
    maker: { title: "Crea tus propios *juegos arcade.*", sub: "Willy Maker arma una ROM real en el navegador, y se juega en una sala." },
    metrics: { title: "Cada milisegundo, *medido.*", chips: ["latencia", "paquetes perdidos", "congelamientos explicados"] },
    end: { title: "Jueguen juntos, desde *cualquier lugar.*", free: "Gratis · código abierto (MIT)" },
  },
  pt: {
    tagline: "Noites de fliperama, online.",
    home: { title: "Seus jogos ficam no *seu* computador.", sub: "O go-link roda o MAME na sua casa e transmite. Suas ROMs nunca saem do seu disco." },
    friends: { title: "Seus amigos jogam pelo *navegador.*", sub: "Sem instalar nada. Um código, um PIN e pronto." },
    invite: { title: "Convide com um link, um código ou um *QR.*", chips: ["um PIN, uma pessoa", "salas privadas"] },
    controls: { title: "Controles de verdade. *Voz de verdade.*", chips: ["P1 · P2 · P3 · P4", "chat de voz", "teclado e controles"] },
    phone: { title: "Seu celular vira um *console.*", sub: "Em pé é um portátil; deitado, com as duas mãos." },
    maker: { title: "Crie seus próprios *jogos de fliperama.*", sub: "O Willy Maker gera uma ROM de verdade no navegador, e ela roda numa sala." },
    metrics: { title: "Cada milissegundo, *medido.*", chips: ["latência", "pacotes perdidos", "congelamentos explicados"] },
    end: { title: "Joguem juntos, de *qualquer lugar.*", free: "Grátis · código aberto (MIT)" },
  },
};
