// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Brazilian Portuguese user documentation (same pages and slugs as docs-en.ts).
import type { Docs } from "./docs-types";

export const docsPt: Docs = {
  title: "Documentação",
  eyebrow: "Docs",
  search: "Buscar na documentação",
  noResults: "Nenhuma página encontrada.",
  onThisPage: "Nesta página",
  previous: "Anterior",
  next: "Próxima",
  menu: "Menu da documentação",
  copy: "Copiar",
  edit: "Melhorar esta página no GitHub",
  pages: [
    {
      slug: "introduction",
      group: "Começar",
      title: "Introdução",
      lead: "O go-link transforma seu computador em um pequeno servidor de arcade: você roda os jogos e seus amigos jogam pelo navegador.",
      blocks: [
        { t: "h2", id: "what", text: "O que o go-link faz" },
        {
          t: "p",
          text: "Você (o **anfitrião**) instala o app go-link no seu computador, com os seus próprios arquivos de jogos. Seus amigos (os **convidados**) abrem um convite no navegador e jogam: recebem o vídeo e o som do jogo e enviam os controles de volta. Eles não instalam nada e nunca precisam dos arquivos dos jogos.",
        },
        {
          t: "list",
          items: [
            "Até **4 jogadores** ao mesmo tempo (P1 a P4). Os outros assistem ao vivo e esperam em uma fila, como num arcade.",
            "Voz entre os jogadores e chat para todos.",
            "Vários jogos ao mesmo tempo, com pausa, partidas salvas e histórico.",
            "Teclado, controles (vários por navegador) e um controle na tela do celular, que vira um console portátil (Game Boy em pé, Switch deitado).",
            "Gravações com as vozes de todos, exportadas para MP4 para o WhatsApp ou o celular, e capturas de tela num toque. Veja [Gravações, capturas e MP4](/docs/recordings).",
          ],
        },
        { t: "h2", id: "how", text: "Como funciona" },
        {
          t: "p",
          text: "O jogo roda só no seu computador. O vídeo, o som e os controles viajam direto entre o seu computador e cada navegador via WebRTC, criptografados. Os servidores do go-link só apresentam vocês uns aos outros; eles nunca veem o jogo.",
        },
        { t: "code", code: "navegadores dos amigos  <-- vídeo, som, voz, controles, chat -->  seu computador (app go-link)\n          \\                                                            /\n           `-----------> servidor de sinalização (apresentações) <---'" },
        { t: "h2", id: "games", text: "Sobre os jogos" },
        {
          t: "p",
          text: "O go-link é baseado no MAME: usa o motor mame2003-plus, que roda sets do **MAME 0.78**. O go-link não inclui, hospeda nem baixa nenhum jogo. Use apenas arquivos que você tem o direito de usar, como cópias de segurança de placas arcade suas. Veja os [termos de uso](/terms).",
        },
        { t: "h2", id: "next", text: "Por onde começar" },
        { t: "steps", items: ["[Instale](/docs/install) o app no computador que tem os seus jogos.", "[Vincule seu navegador](/docs/link) com o código de 9 dígitos.", "[Prepare o emulador e as suas ROMs](/docs/roms).", "[Comece sua primeira partida](/docs/first-game) e convide seus amigos."] },
      ],
    },
    {
      slug: "install",
      group: "Começar",
      title: "Instalação",
      lead: "Baixe o go-link para o seu sistema na página de versões. O app é leve: o emulador é baixado depois, de dentro do próprio app.",
      blocks: [
        {"t": "note", "tone": "info", "text": "Downloads: [github.com/lordbasex/go-link/releases](https://github.com/lordbasex/go-link/releases). Escolha o seu sistema abaixo."},
        {"t": "tabs", "label": "Seu sistema", "tabs": [{"id": "macos", "label": "macOS", "os": "macos", "blocks": [{"t": "steps", "items": ["Baixe `go-link-vX.Y.Z-macos-universal.dmg` (Intel e Apple Silicon, macOS 12 ou posterior).", "Abra e arraste o **go-link** para **Aplicativos**.", "Abra o go-link em Aplicativos ou no Launchpad. O ícone aparece na barra de menus."]}, {"t": "note", "tone": "warn", "text": "Enquanto o app não for notarizado pela Apple, o macOS o bloqueia na primeira vez. Tente abri-lo, depois vá em **Ajustes do Sistema › Privacidade e Segurança** e clique em **Abrir Mesmo Assim**. No macOS 14 ou anterior, clique com o botão direito no app e escolha **Abrir**."}, {"t": "p", "text": "Ou com o Homebrew:"}, {"t": "code", "code": "brew tap lordbasex/go-link https://github.com/lordbasex/go-link\nbrew install --cask go-link"}]}, {"id": "windows", "label": "Windows", "os": "windows", "blocks": [{"t": "steps", "items": ["Baixe `go-link-vX.Y.Z-windows-amd64.zip` (ou `-arm64.zip` para computadores ARM).", "Descompacte e rode `go-link-device.exe`. Ele abre uma janela e um ícone na área de notificação.", "Se o SmartScreen avisar, clique em **Mais informações › Executar assim mesmo**."]}, {"t": "note", "tone": "info", "text": "Windows 10 ou 11. Não é preciso instalar mais nada."}]}, {"id": "linux", "label": "Linux", "os": "linux", "blocks": [{"t": "p", "text": "Para um computador desktop (x64 ou ARM64). Precisa de OpenGL e Wayland ou X11, que qualquer desktop tem."}, {"t": "p", "text": "Baixe o arquivo do seu processador, descompacte e rode:"}, {"t": "code", "code": "tar xzf go-link-vX.Y.Z-linux-amd64.tar.gz     # or -linux-arm64\n./go-link-device"}]}, {"id": "raspberry-pi", "label": "Raspberry Pi", "blocks": [{"t": "p", "text": "Use a versão **sem janela**: sem janela, com um [painel web](/docs/panel) na porta 7373 e uma [linha de comando](/docs/cli) completa. Uma Raspberry Pi precisa de um sistema de 64 bits (Raspberry Pi OS 64-bit)."}, {"t": "steps", "items": ["Baixe e descompacte `go-link-vX.Y.Z-linux-arm64-headless.tar.gz` (em um servidor x64, `-linux-amd64-headless`).", "Baixe o emulador e escolha a sua pasta de ROMs.", "Inicie o go-link e abra o painel de outro computador: `http://<endereço>:7373`."]}, {"t": "code", "code": "tar xzf go-link-vX.Y.Z-linux-arm64-headless.tar.gz\n# emulador e pasta de ROMs\n./go-link-device core download\n./go-link-device roms dir /media/usb/roms\n# rode (mantenha rodando com um serviço, tmux ou screen)\n./go-link-device\n# a chave para abrir o painel web\n./go-link-device panel token"}]}, {"id": "docker", "label": "Docker", "blocks": [{"t": "p", "text": "A imagem é o go-link sem janela, com o painel web na porta 7373. Tudo o que ele guarda fica no volume /data."}, {"t": "code", "code": "docker load < go-link-vX.Y.Z-docker.oci.tar.gz\ndocker run -d --name go-link --network host \\\n  -v go-link:/data \\\n  -v ~/roms:/data/go-link/roms \\\n  go-link-device"}, {"t": "p", "text": "Portas, volumes e Docker Desktop: veja [Docker](/docs/docker)."}]}]},
        {"t": "h2", "id": "check", "text": "Confira o download"},
        {"t": "p", "text": "Cada arquivo de uma versão está listado em `SHA256SUMS`. Para conferir o seu:"},
        {"t": "code", "code": "shasum -a 256 -c SHA256SUMS --ignore-missing"},
        {"t": "p", "text": "No Windows: `certutil -hashfile go-link-vX.Y.Z-windows-amd64.zip SHA256`, e compare com a linha do `SHA256SUMS`."},
        {"t": "h2", "id": "next", "text": "Próximo"},
        {"t": "p", "text": "[Vincule seu navegador](/docs/link) com o código que o app mostra."},
      ],
    },
    {
      slug: "link",
      group: "Começar",
      title: "Vincule seu navegador",
      lead: "Vincular conecta um navegador ao seu app go-link, para gerenciá-lo pelo site: jogos, ROMs, salas e convites.",
      blocks: [
        { t: "steps", items: ["Abra o go-link no seu computador. A janela mostra um **código de 9 dígitos**.", "Em um navegador, acesse [go-link.org/device](/device) (Meu dispositivo).", "Digite o código (ou cole no primeiro campo).", "Leia e aceite os termos de uso e clique em **Vincular**."] },
        { t: "p", text: "A página vira o painel ao vivo do seu dispositivo: CPU, memória, rede, jogadores e a sua biblioteca de jogos." },
        { t: "h2", id: "remembered", text: "Um navegador lembrado" },
        {
          t: "p",
          text: "Você digita o código uma única vez. O navegador fica lembrado e da próxima vez se reconecta sozinho, mesmo depois de reiniciar o computador. Antes de o navegador mostrar a chave dele, o app prova que é mesmo o seu dispositivo.",
        },
        { t: "h2", id: "more", text: "Mais navegadores e desvincular" },
        {
          t: "list",
          items: [
            "Para vincular um segundo navegador (o do celular, por exemplo), clique em **Link another browser** na janela do app: ele mostra um código novo.",
            "**Desvincular** no site esquece aquele navegador. **Unlink all** na janela do app esquece todos e mostra um código de novo.",
            "O código muda a cada poucos minutos e só pode ser usado uma vez. Se ele for recusado, digite o que a janela mostra agora.",
          ],
        },
      ],
    },
    {
      slug: "roms",
      group: "Começar",
      title: "Emulador e ROMs",
      lead: "O go-link usa o emulador mame2003-plus, que roda sets do MAME 0.78. Você baixa o emulador uma vez e indica ao go-link a sua pasta de ROMs.",
      blocks: [
        { t: "h2", id: "core", text: "Baixe o emulador" },
        {
          t: "p",
          text: "Em **Meu dispositivo**, ou na janela do app (**Emulators › MAME › ROMs**), clique no botão para baixar o emulador e a lista de jogos dele. O go-link os baixa do servidor oficial do libretro para o seu sistema. Pelo terminal: `go-link-device core download`.",
        },
        { t: "h2", id: "folder", text: "Sua pasta de ROMs" },
        {
          t: "list",
          items: [
            "Por padrão o go-link lê `~/go-link/roms`. Escolha outra pasta na janela do app, em Meu dispositivo › ROMs ou com `go-link-device roms dir /caminho/das/roms`.",
            "Mantenha cada jogo como o seu `.zip`, com o nome do set do MAME (por exemplo `galaga.zip`).",
            "Jogos que precisam de uma BIOS ou de um set pai precisam também desse zip na mesma pasta (por exemplo `neogeo.zip`).",
            "Para adicionar jogos, solte arquivos `.zip` na janela do app ou em Meu dispositivo › ROMs. Eles são copiados para a sua pasta; um arquivo existente nunca é substituído.",
          ],
        },
        { t: "h2", id: "check", text: "Quais jogos rodam" },
        { t: "p", text: "O go-link confere cada zip com a lista de jogos do emulador, sem rodá-lo, e mostra um estado para cada jogo:" },
        {
          t: "table",
          head: ["Estado", "O que significa"],
          rows: [
            ["Roda", "Todos os arquivos estão lá."],
            ["Faltam arquivos", "Faltam arquivos, geralmente porque o set é de outra versão do MAME. A lista mostra qual zip ou quais arquivos."],
            ["Fora deste emulador", "O jogo foi adicionado ao MAME depois da versão 0.78."],
            ["BIOS", "Uma BIOS usada por outros jogos, não um jogo."],
            ["Zip corrompido", "O arquivo está danificado."],
          ],
        },
        { t: "note", tone: "info", text: "Os sets precisam ser do **MAME 0.78**. Um set de um MAME recente costuma ter outros nomes de arquivo e aparece como Faltam arquivos." },
        { t: "h2", id: "rights", text: "Seus jogos, sua responsabilidade" },
        { t: "p", text: "O go-link nunca inclui nem baixa jogos. Use apenas arquivos que você tem o direito de usar; veja os [termos de uso](/terms)." },
      ],
    },
    {
      slug: "first-game",
      group: "Começar",
      title: "Sua primeira partida",
      lead: "Uma sala é um jogo rodando no seu computador. Crie pelo site e depois convide seus amigos.",
      blocks: [
        { t: "steps", items: ["Em **Salas**, clique em **Nova partida** (ou em **Jogar** em um jogo de Meu dispositivo › ROMs).", "Escolha o jogo, um nome para a sala e se os jogadores podem falar e usar o chat.", "Clique para começar. O go-link carrega o jogo e abre a sala.", "Clique em **Convidar** para ter o link, o QR code e um PIN para o seu amigo."] },
        { t: "p", text: "Você entra na sua própria sala na hora: o seu navegador é o dono, então não precisa de PIN." },
        { t: "h2", id: "test", text: "O padrão de teste" },
        {
          t: "p",
          text: "Antes de convidar alguém, teste o **Padrão de teste** em Meu dispositivo: uma tela de teste de TV com um relógio, um tom de 1 kHz e o desenho de um controle que acende quando você aperta as teclas. Se você vê e ouve, o caminho inteiro funciona.",
        },
      ],
    },
    {
      slug: "invite",
      group: "Jogar",
      title: "Convide amigos",
      lead: "Todas as salas são privadas. O convite é a porta; o PIN é a chave, e existe um PIN por pessoa.",
      blocks: [
        { t: "h2", id: "door", text: "O convite" },
        {
          t: "list",
          items: [
            "**Convidar** na sala mostra um link, um QR code e um código de 9 dígitos. Envie qualquer um deles.",
            "Seu amigo abre o link, ou digita o código em **Entrar em uma partida** no site.",
            "**Novo link** troca o link, o QR e o código: os antigos param de funcionar. Quem já está dentro continua.",
          ],
        },
        { t: "h2", id: "pin", text: "Um PIN por pessoa" },
        {
          t: "list",
          items: [
            "Cada vez que você convida alguém, o go-link cria um PIN novo de 6 dígitos. A primeira pessoa que o usa entra, e ele se esgota.",
            "Um PIN não usado dura 6 horas. Todos os PINs acabam quando a sala fecha.",
            "Convidados que já entraram podem voltar depois de recarregar a página sem PIN.",
            "Depois de 5 tentativas erradas o convidado é bloqueado; 20 erros em 10 minutos travam a sala por 10 minutos.",
          ],
        },
        { t: "note", tone: "info", text: "Nunca coloque o PIN no link. Envie o link e o PIN separados, ou diga o PIN em voz alta." },
        { t: "h2", id: "guest", text: "O que um convidado vê" },
        { t: "p", text: "O convidado digita o código (ou abre o link) e o PIN, aceita os termos na primeira vez e entra. Os convidados veem o jogo, os jogadores, o chat e os controles, mas não as configurações da sala." },
      ],
    },
    {
      slug: "controls",
      group: "Jogar",
      title: "Controles",
      lead: "Jogue com o teclado, com controles ou com o controle na tela de um celular ou tablet.",
      blocks: [
        { t: "h2", id: "keyboard", text: "Teclado" },
        {
          t: "table",
          head: ["Tecla", "Ação"],
          rows: [
            ["Setas", "Mover"],
            ["Z X C A S D", "Botões 1 a 6"],
            ["5", "Inserir uma ficha"],
            ["Enter", "O seu próprio Start"],
            ["1 2 3 4", "Start dos jogadores 1 a 4, como a fileira de botões Start de um painel de arcade"],
            ["P", "Pausar o jogo para todos"],
            ["V (segurar)", "Falar"],
          ],
        },
        { t: "p", text: "Abra os controles (o ícone de controle sobre o vídeo) para ver o mapa do teclado e trocar qualquer tecla." },
        { t: "h2", id: "gamepads", text: "Controles" },
        {
          t: "list",
          items: [
            "Conecte por USB ou Bluetooth e aperte qualquer botão: os navegadores só mostram um controle depois do primeiro aperto.",
            "Cada controle é um jogador, então várias pessoas podem jogar em um computador. O teclado joga como o jogador que você escolher.",
            "Se um botão fizer algo inesperado, use **Remapear botões** no painel de controles.",
          ],
        },
        { t: "h2", id: "touch", text: "Celulares e tablets" },
        {
          t: "list",
          items: [
            "Num celular ou tablet a sala vira um console portátil que ocupa a tela toda: em pé é como um Game Boy (a imagem em cima, o controle embaixo), deitado como um Switch (a imagem no meio e meio controle de cada lado).",
            "Setas à esquerda e os botões do jogo à direita (só os que o jogo usa); Ficha e 1P, 2P… ficam junto deles, como Select e Start.",
            "O primeiro toque esconde as barras do navegador onde o celular permite (Android). No iPhone, adicione o go-link à tela de início para ter tela cheia de verdade.",
            "O chat, os jogadores, a fila, Como jogar e Sair abrem pela aba da borda direita, que conta as mensagens novas.",
            "Os botões sobre o vídeo são transparentes e somem após 3 segundos; toque na imagem para que voltem. O ícone de controle desliga (e religa) o controle na tela.",
          ],
        },
        { t: "h2", id: "seats", text: "Lugares, fila e troca de controle" },
        {
          t: "list",
          items: [
            "As quatro primeiras pessoas ocupam os lugares P1 a P4. As outras esperam na fila; quando um jogador sai, o primeiro da fila fica com aquele lugar.",
            "Para trocar de controle com alguém, use a cápsula de jogadores sobre o vídeo: um lugar livre é seu na hora, um ocupado pede ao outro jogador.",
            "Qualquer jogador sentado pode apertar o Start de outro lugar (1P, 2P…) para começar uma partida juntos.",
          ],
        },
      ],
    },
    {
      slug: "voice-chat",
      group: "Jogar",
      title: "Voz e chat",
      lead: "Os jogadores sentados podem conversar entre si; todos podem usar o chat.",
      blocks: [
        {
          t: "list",
          items: [
            "Só os jogadores nos lugares P1 a P4 podem falar. Ligue o microfone no painel da sala, ou segure **V**.",
            "O som do jogo e a voz têm volumes separados, e você pode silenciar um jogador.",
            "A voz viaja criptografada de cada jogador para o app do anfitrião e dali para os outros jogadores. Só é gravada quando o anfitrião grava a partida, e então todos veem **REC** sobre o vídeo e um aviso no chat.",
            "As mensagens do chat têm até 300 caracteres, e você vê quem está digitando.",
            "O anfitrião pode desligar o chat de uma sala.",
          ],
        },
        { t: "note", tone: "info", text: "Os navegadores podem começar o jogo sem som. Toque em qualquer lugar, ou no botão de som, para ouvir." },
      ],
    },
    {
      slug: "recordings",
      group: "Jogar",
      title: "Gravações, capturas e MP4",
      lead: "O anfitrião pode gravar uma partida com as vozes de todos e exportá-la como MP4 pronto para o WhatsApp ou o celular.",
      blocks: [
        { t: "h2", id: "record", text: "Gravar uma partida" },
        {
          t: "list",
          items: [
            "Só o anfitrião grava: toque no ponto vermelho nos controles da sala (só em salas de jogo). O quadrado para a gravação.",
            "Todos na sala veem **REC** sobre o vídeo e um aviso no chat, porque as vozes também são gravadas.",
            "Uma gravação para sozinha após **2 horas ou 2 GB**, quando a partida é pausada (antes pergunta) e quando a sala é fechada ou apagada.",
            "Gravar quase não gasta nada: o dispositivo salva a imagem e o som que já envia, sem codificá-los de novo. Os arquivos ficam em `~/go-link/rec/` no computador do anfitrião (WebM).",
          ],
        },
        { t: "h2", id: "export", text: "Baixar e exportar para MP4" },
        {
          t: "steps",
          items: [
            "Quando uma gravação termina, o navegador do anfitrião oferece baixá-la (também depois, em **Meu dispositivo › Histórico**).",
            "O arquivo vem do dispositivo pela conexão direta, em partes de 60 KB, com progresso, botão para cancelar e verificação SHA-256.",
            "Se alguém falou, abre uma **prévia**: dê play e ajuste os volumes de **Jogo** e **Vozes** (de 0 a 300 %). Um medidor avisa se a mixagem satura.",
            "**Exportar MP4**: seu navegador converte para MP4 (vídeo H.264, som AAC, a imagem ampliada com pixels nítidos). O dispositivo não participa.",
          ],
        },
        {
          t: "table",
          head: ["Faixa de som do MP4", "O que tem"],
          rows: [
            ["1 · Jogo e vozes", "A mixagem com seus volumes. A padrão: a que tocam os celulares, o WhatsApp e a maioria dos players."],
            ["2 · Jogo", "Só o jogo, com seu volume."],
            ["3 · Vozes", "Só as vozes dos jogadores, com seu volume."],
          ],
        },
        { t: "note", tone: "info", text: "Um player toca uma faixa de som por vez; VLC e QuickTime deixam trocar (Áudio › Faixa). Sem vozes, o MP4 traz só a faixa do jogo. Navegadores que não conseguem converter (sem WebCodecs) salvam o WebM original, que toca no Chrome, Firefox e VLC." },
        { t: "h2", id: "screenshot", text: "Capturas de tela" },
        { t: "p", text: "Qualquer um na sala pode tocar no botão da câmera nos controles: um PNG do jogo (pixels nítidos, no formato do jogo) vai para seus downloads. Só o seu navegador participa." },
        { t: "h2", id: "manage", text: "Gerenciar e apagar" },
        {
          t: "list",
          items: [
            "**Meu dispositivo › Histórico** mostra cada partida com suas gravações: baixe ou apague cada uma, ou apague uma partida do histórico junto com suas gravações.",
            "Limpar o histórico apaga todas as gravações. **Restaurar de fábrica** (Meu dispositivo) apaga salas, jogos salvos, histórico, gravações, navegadores lembrados e ajustes; suas ROMs, imagens e o emulador ficam.",
            "Pela linha de comando: `device rec list`, `device rec rm ID` e `device reset --yes` (com o dispositivo parado).",
          ],
        },
      ],
    },
    {
      slug: "rooms",
      group: "Jogar",
      title: "Gerencie as salas",
      lead: "Seu computador pode rodar vários jogos ao mesmo tempo. Cada sala pode ser pausada, salva, arquivada e restaurada.",
      blocks: [
        {
          t: "table",
          head: ["Estado", "O que significa"],
          rows: [
            ["Ao vivo", "O jogo está rodando e dá para entrar."],
            ["Pausada", "Pausada para todos; o jogo continua na memória."],
            ["Arquivada", "Desligada. O jogo é salvo automaticamente e você pode ligá-la depois."],
            ["Lixeira", "Salas apagadas ficam 30 dias na lixeira e depois somem com as partidas salvas."],
          ],
        },
        {
          t: "list",
          items: [
            "**Salvar partida** guarda o jogo em um espaço numerado. Ao ligar a sala de novo você escolhe: continuar de onde parou, começar do zero ou carregar uma partida salva.",
            "Marque favoritas com a estrela: elas aparecem primeiro.",
            "Por padrão rodam até 4 jogos ao mesmo tempo (os pausados contam).",
            "As salas que estavam rodando quando o computador desligou voltam sozinhas.",
          ],
        },
        { t: "h2", id: "no-saves", text: "Jogos que não podem ser salvos" },
        {
          t: "p",
          text: "O emulador não consegue salvar alguns jogos por completo (alguns chips ficam de fora). O go-link testa cada jogo uma vez e os marca como **não pode ser salvo**: eles sempre começam do início e, em vez de arquivá-los, você pode pausá-los, o que os mantém na memória.",
        },
      ],
    },
    {
      slug: "app",
      group: "O app go-link",
      title: "A janela do app",
      lead: "A janela do go-link e o ícone na barra de menus mostram o que o seu computador está fazendo. Fechar a janela mantém o go-link rodando.",
      blocks: [
        {
          t: "table",
          head: ["Seção", "O que você encontra"],
          rows: [
            ["Resumo", "As salas, quem está jogando, CPU, memória, rede, transmissão, jogadores e latência; um aviso para baixar quando sai uma versão nova; Abrir o go-link, Vincular outro navegador e Desvincular todos; e Este computador: hardware, ID do dispositivo e versão."],
            ["Emuladores › MAME › ROMs", "O estado do emulador, sua pasta de ROMs, uma área para soltar sets .zip e copiá-los para lá, e quantos sets existem, quantos rodam e quanto espaço ocupam. Cada jogo e Jogar estão no site."],
            ["Emuladores › MAME › Imagens", "Quais jogos têm imagens e onde colocá-las."],
            ["Ajustes", "Geral (o idioma da janela: inglês, espanhol ou português), qual imagem mostrar, a pasta de imagens, e informações de salas e rede."],
          ],
        },
        { t: "p", text: "Clique no ícone da barra de menus para ver um pequeno painel com o estado; clique com o botão direito para o menu. **Quit** encerra o go-link." },
        { t: "h2", id: "history", text: "Histórico" },
        { t: "p", text: "Meu dispositivo › Histórico lista cada jogo que rodou: quando, quais jogadores entraram, seus lugares e sua conexão. Fica no seu computador e só você vê." },
      ],
    },
    {
      slug: "thumbnails",
      group: "O app go-link",
      title: "Imagens dos jogos",
      lead: "O go-link mostra as suas próprias imagens dos jogos (thumbnails) na biblioteca e nas salas. Ele nunca as baixa.",
      blocks: [
        { t: "p", text: "Coloque-as em `~/go-link/thumbnails/MAME`, uma pasta por tipo, com o nome do set ou o título do jogo:" },
        { t: "code", code: "Named_Boxarts/galaga.png   a caixa ou o flyer\nNamed_Titles/galaga.png    a tela de título\nNamed_Snaps/galaga.png     uma captura" },
        {
          t: "list",
          items: [
            "Solte imagens, ou uma pasta com essas três pastas, na aba Thumbnails da janela do app.",
            "Escolha qual tipo aparece em Ajustes (ou em Meu dispositivo › ROMs no site), ou com `go-link-device thumbnails kind boxart|title|snap`.",
            "`go-link-device thumbnails check` conta quantos jogos têm cada tipo.",
          ],
        },
      ],
    },
    {
      slug: "panel",
      group: "O app go-link",
      title: "Sem janela e painel web",
      lead: "Em um computador sem tela (uma Raspberry Pi, um servidor, Docker) o go-link roda sem janela e serve o seu próprio painel web na sua rede.",
      blocks: [
        { t: "code", code: "./go-link-device --headless\n./go-link-device panel token       # a chave do painel" },
        {
          t: "steps",
          items: ["Inicie o go-link sem janela. O painel web abre na porta 7373.", "Em outro computador da sua rede, abra `http://<endereço do dispositivo>:7373`.", "Cole a chave do painel (`go-link-device panel token`), aceite os termos e abra o painel."],
        },
        {
          t: "list",
          items: [
            "O painel é o mesmo Meu dispositivo e as mesmas Salas que você usa no site, e funciona também em uma rede sem internet.",
            "A chave nunca viaja pela rede: o navegador prova que a conhece. Cinco tentativas erradas em um minuto bloqueiam aquele endereço por 5 minutos.",
            "`--panel :8000` troca a porta; `--no-panel` desliga. `panel token --new` cria uma chave nova (com o go-link parado).",
            "Os amigos pela internet continuam entrando pelo go-link.org com o convite.",
          ],
        },
      ],
    },
    {
      slug: "cli",
      group: "O app go-link",
      title: "Linha de comando",
      lead: "Tudo o que o site faz também pode ser feito pelo terminal. No macOS, o programa fica dentro do app: `/Applications/go-link.app/Contents/MacOS/go-link-device`.",
      blocks: [
        {
          t: "code",
          code: "go-link-device                          roda o go-link\ngo-link-device core download            baixa o emulador e a lista de jogos\ngo-link-device roms dir [CAMINHO]       mostra ou troca a pasta de ROMs\ngo-link-device roms check [--json]      confere quais jogos rodam\ngo-link-device roms saves [--json]      testa quais jogos podem ser salvos\ngo-link-device thumbnails check         conta as imagens dos jogos\ngo-link-device thumbnails dir [CAMINHO] mostra ou troca a pasta de imagens\ngo-link-device thumbnails kind [TIPO]   boxart, title ou snap\ngo-link-device panel token [--new]      mostra ou troca a chave do painel\ngo-link-device --help                   todas as opções e a versão",
        },
        {
          t: "table",
          head: ["Opção", "O que faz"],
          rows: [
            ["--headless", "Sem janela: log, linha de comando e painel web"],
            ["--server-signaling URL", "Usa outro servidor de sinalização nesta execução"],
            ["--udp-port N, --announce IPs", "Uma porta UDP fixa para conexões diretas (veja Conexão)"],
            ["--config CAMINHO", "Outro arquivo de configuração"],
            ["--debug", "Logs detalhados"],
          ],
        },
        { t: "p", text: "Sem terminal, o log fica em `~/go-link/logs/device.log`." },
      ],
    },
    {
      slug: "docker",
      group: "O app go-link",
      title: "Docker",
      lead: "A imagem Docker é o go-link sem janela, com o painel web na porta 7373. Tudo o que ele guarda fica no volume /data.",
      blocks: [
        { t: "code", code: "docker load < go-link-vX.Y.Z-docker.oci.tar.gz\ndocker run -d --name go-link --network host \\\n  -v go-link:/data \\\n  -v ~/roms:/data/go-link/roms \\\n  -v ~/thumbnails/MAME:/data/go-link/thumbnails/MAME:ro \\\n  go-link-device" },
        {
          t: "list",
          items: [
            "Monte as suas ROMs em `/data/go-link/roms` e as imagens em `/data/go-link/thumbnails/MAME`. Adicione `:ro` às ROMs para bloquear envios pelo site.",
            "A chave do painel: `docker exec go-link go-link-device panel token --config /data/device.json`.",
            "Sem a rede do host (Docker Desktop), publique o painel e uma porta UDP fixa, e anuncie o endereço do seu computador: `-p 7373:7373 -p 50000:50000/udp` e `--udp-port 50000 --announce 192.168.1.20`.",
          ],
        },
      ],
    },
    {
      slug: "connection",
      group: "Rede",
      title: "Conexão",
      lead: "O go-link conecta cada navegador direto ao seu computador quando pode, e por um relay quando não pode.",
      blocks: [
        {
          t: "p",
          text: "A sala mostra a latência e o caminho: **direto** ou **relay**. O relay sempre funciona, mas soma a ida até o servidor do relay. Direto é o melhor para jogos rápidos.",
        },
        { t: "h2", id: "port", text: "Uma porta UDP fixa" },
        { t: "p", text: "Se amigos da sua rede ou da internet passam pelo relay, dê ao go-link uma porta UDP fixa e redirecione-a no seu roteador:" },
        { t: "steps", items: ["Escolha uma porta, por exemplo 50000, e inicie o go-link com `--udp-port 50000` (ou `udp_port` no arquivo de configuração).", "No roteador, redirecione essa porta UDP para o seu computador.", "Informe ao go-link o endereço em que seus amigos chegam a essa porta: `--announce <seu endereço público>` (ou `announce_ips`)."] },
        { t: "code", code: "{ \"udp_port\": 50000, \"announce_ips\": [\"203.0.113.7\"] }" },
        { t: "note", tone: "info", text: "Todas as salas usam a mesma porta, então uma única regra de redirecionamento basta." },
      ],
    },
    {
      slug: "own-server",
      group: "Rede",
      title: "Seu próprio servidor de sinalização",
      lead: "O servidor de sinalização só apresenta os navegadores ao seu app. Você pode usar o seu em vez do público.",
      blocks: [
        { t: "p", text: "O servidor é o [signalhub](https://github.com/lordbasex/signalhub), de código aberto, para qualquer servidor Linux com Docker. O README dele lista as portas a abrir e as configurações." },
        {
          t: "steps",
          items: ["Instale o signalhub, permitindo `https://go-link.org` em `ALLOWED_ORIGINS` e o app `go-link` em `ALLOWED_APPS`.", "Inicie o seu app com `--server-signaling wss://seu-servidor/ws`, ou coloque `signal_url` no arquivo de configuração.", "No site, clique no botão **Servidor de sinalização** do cabeçalho, digite o mesmo endereço e salve. Cada jogador precisa fazer o mesmo."],
        },
        { t: "note", tone: "warn", text: "O site nunca pega o servidor de um link, só desse botão, assim ninguém consegue mandar seus amigos para outro servidor com um link preparado." },
      ],
    },
    {
      slug: "troubleshooting",
      group: "Ajuda",
      title: "Problemas frequentes",
      lead: "Os problemas mais comuns e como resolvê-los.",
      blocks: [
        { t: "h2", id: "offline", text: "Meu dispositivo aparece “offline”" },
        { t: "p", text: "O go-link não está rodando no seu computador, ou usa um servidor de sinalização diferente do site. Abra o app e confira o servidor em Settings." },
        { t: "h2", id: "code", text: "“Esse código é inválido ou expirou”" },
        { t: "p", text: "O código muda a cada poucos minutos e funciona uma vez. Digite o que a janela mostra agora. Se você usa o seu próprio servidor, configure-o primeiro no site." },
        { t: "h2", id: "missing", text: "Um jogo mostra “Faltam arquivos”" },
        { t: "p", text: "O set é de outra versão do MAME, ou o zip pai ou a BIOS não está na mesma pasta. O go-link precisa de sets do MAME 0.78." },
        { t: "h2", id: "sound", text: "Sem som" },
        { t: "p", text: "Os navegadores podem começar sem som: toque em qualquer lugar ou no botão de som. Confira o volume do jogo no painel da sala." },
        { t: "h2", id: "lag", text: "O jogo está lento" },
        { t: "p", text: "Se a sala mostra **relay**, configure uma [porta UDP fixa](/docs/connection). Uma conexão com cabo no computador do anfitrião também ajuda." },
        { t: "h2", id: "browser", text: "O vídeo nunca começa" },
        { t: "p", text: "Tente outro navegador: Chrome e Edge funcionam melhor. Algumas redes bloqueiam a conexão; nesse caso o relay é usado." },
        { t: "h2", id: "pin", text: "“Alguém já entrou com este convite”" },
        { t: "p", text: "Cada PIN vale para uma pessoa. Peça um convite novo ao anfitrião." },
        { t: "h2", id: "restart", text: "Um jogo começa do início" },
        { t: "p", text: "O emulador não consegue salvar esse jogo por completo, então o go-link sempre o começa do zero. Pause a sala em vez de arquivá-la." },
        { t: "h2", id: "macos", text: "O macOS diz que não pode abrir o app" },
        { t: "p", text: "Vá em **Ajustes do Sistema › Privacidade e Segurança** e clique em **Abrir Mesmo Assim** (veja [Instalação](/docs/install))." },
        { t: "h2", id: "help", text: "Ainda com problemas?" },
        { t: "p", text: "Abra uma issue no [GitHub](https://github.com/lordbasex/go-link/issues) com o seu sistema e a versão do go-link (o Resumo do app, ou `go-link-device --help`)." },
      ],
    },
  ],
};
