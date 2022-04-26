import OmeggaPlugin, {
  OL,
  PS,
  PC,
  Vector,
  Brick,
  OmeggaPlayer,
  ColorRgb,
} from 'omegga';

const EGG_COLORS = [
  [253, 206, 222, 255],
  [158, 248, 223, 255],
  [255, 252, 184, 255],
  [252, 196, 112, 255],
  [119, 248, 253, 255],
  [224, 187, 228, 255],
  [149, 125, 173, 255],
  [210, 145, 188, 255],
  [254, 200, 216, 255],
  [255, 223, 211, 255],
].map(OMEGGA_UTIL.color.linearRGB) as [number, number, number, number][];

const GOLD_EGG_COLOR = [255, 200, 0, 255];

const TEMPLATE_EGG_COLOR = [255, 255, 255];
const TEMPLATE_EGG_MATERIAL = 'BMC_Glow';
const TEMPLATE_EGG_MATERIAL_INTENSITY = 10;

const EGG_FIND_MESSAGES = [
  "An egg! You've got % egg[s]!",
  'Another one! % is a lot!',
  'Ooh, a piece of candy!',
  'EGG. % EGG[S].',
  "You've colleggted % egg[s].",
  'Fantastegg!',
  'Speggtacular!',
  'Scrambled!',
  'Another one in the basket!',
  'Another one bites the dust!',
  'Eggcelent!',
  'Eggstravagant!',
  "Go get 'em champ!",
  'GET IN THERE SOLDIER!!!',
  'a5 tomorrow? a%? tomorrow?',
  'POACHED.',
  'Over easy??!',
  'Sunny. Side. Up.',
  'That one was spoiled...',
  'BOILED!',
  'Yolks!!!',
  'THAT ONE WAS A LITTLE BIG!',
  'Ostrich flavored.',
  'That one stunk...',
  'Hop to it!',
  "That's a lotta damage!",
  "Don't you think % egg[s] is too many?",
  '% e g g [s]',
  "you've been in a coma for % year[s]. wake up.",
  '1... 2... %!',
  '% down, more to go!',
  'Holy cow, % egg[s]?!',
  'How can u fit % egg[s] in ur pockets???',
];

type Config = {
  eggAsset: string;
  eggSize: string;
  amount: number;
  gameLength: number;
  autorestartDelay: number;
  auth: { id: string; name: string }[];
};
type Storage = { eggs?: Vector[] };

function eq<T>(a: T[], b: T[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function timeFormat(secs: number): string {
  secs = Math.round(secs / 1000);
  if (secs < 60) return `0:${secs.toString().padStart(2, '0')}`;
  else
    return `${Math.floor(secs / 60)}:${(secs % 60)
      .toString()
      .padStart(2, '0')}`;
}

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OL;
  config: PC<Config>;
  store: PS<Storage>;
  eggs: Storage['eggs'];
  eggSize: Vector;

  foundEggs: Vector[];
  curEggs: number;
  players: { [id: string]: number };
  gameTimeout: NodeJS.Timeout;
  gameInterval: NodeJS.Timer;
  gameStartTime: number;
  goldenEgg: Vector;
  goldenEggFinder?: string;
  autorestartTimeout: NodeJS.Timeout;

  constructor(omegga: OL, config: PC<Config>, store: PS<Storage>) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
  }

  isAuthed(player: OmeggaPlayer): boolean {
    return (
      player.isHost() || this.config.auth.find(a => a.id === player.id) != null
    );
  }

  async storeEggs() {
    await this.store.set('eggs', this.eggs);
  }

  resetGame() {
    if (this.gameTimeout) {
      clearTimeout(this.gameTimeout);
      this.gameTimeout = undefined;
    }
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = undefined;
    }
    this.players = {};
    this.foundEggs = [];
    this.curEggs = 0;
  }

  eggFind(player: { name: string; id: string }, position: Vector) {
    if (this.foundEggs.find(p => eq(p, position))) return;

    let isGold = this.goldenEgg && eq(position, this.goldenEgg);

    let count = (this.players[player.id] = (this.players[player.id] ?? 0) + 1);
    this.foundEggs.push(position);
    const message = isGold
      ? 'The golden egg!'
      : EGG_FIND_MESSAGES[Math.floor(Math.random() * EGG_FIND_MESSAGES.length)];
    const formattedMessage = message
      .replace('%', count.toString())
      .replace(/\[([Ss])\]/, count === 1 ? '' : '$1');
    this.omegga.middlePrint(
      player.id,
      message.includes('%')
        ? formattedMessage
        : formattedMessage +
            ` You've found ${count} egg${count === 1 ? '' : 's'}.`
    );
    if (isGold) {
      this.goldenEggFinder = player.id;
      this.omegga.broadcast(
        `<color="ff0"><b>${player.name}</b> found the <b><emoji>gold</emoji> golden egg</b>!`
      );
    }
    this.omegga.clearRegion({ center: position, extent: this.eggSize });

    if (this.foundEggs.length === this.curEggs) {
      // game is over
      this.endGame();
    }
  }

  endGame(timeUp = false, force = false) {
    const endTime = Date.now();

    if (this.gameTimeout) {
      clearTimeout(this.gameTimeout);
      this.gameTimeout = undefined;
    }
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = undefined;
    }

    const leaderboard = Object.entries(this.players).sort(
      (a, b) => b[1] - a[1]
    );
    // .slice(0, 5);

    this.omegga.broadcast(
      `<b>${
        timeUp
          ? "Time's up!"
          : `All eggs have been found in <color="ff0">${timeFormat(
              endTime - this.gameStartTime
            )}</>!`
      }</b> Results:`
    );

    let i = 1;
    let lastRank = 0;
    let lastCount = -1;
    for (const [playerId, count] of leaderboard) {
      const player = this.omegga.getNameCache().savedPlayerNames[playerId];
      const rank = count === lastCount ? lastRank : (lastRank = i);
      i++;
      this.omegga.broadcast(
        `${rank}) <color="ff0">${player}</>${
          playerId === this.goldenEggFinder ? ' <emoji>gold</emoji>' : ''
        }, <b>${count}</b> egg${count === 1 ? '' : 's'}`
      );
      lastCount = count;
    }

    this.resetGame();

    for (const center of this.eggs) {
      this.omegga.clearRegion({ center, extent: this.eggSize });
    }

    if (!force && this.config.autorestartDelay > 0)
      this.autorestartTimeout = setTimeout(
        () => this.gameStart(),
        this.config.autorestartDelay * 1000
      );
  }

  eggAmount(): number {
    if (this.config.amount < 1)
      return Math.ceil(this.config.amount * this.eggs.length);
    else return Math.min(this.config.amount, this.eggs.length);
  }

  async spawnEggs(): Promise<number> {
    const bricks = [];
    const eggs = this.eggs
      .map(e => [e, Math.random()] as [Vector, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.eggAmount())
      .map(e => e[0]);

    this.goldenEgg = eggs[Math.floor(Math.random() * eggs.length)];
    this.goldenEggFinder = undefined;

    for (const position of eggs) {
      const isGold = eq(position, this.goldenEgg);

      const brick: Brick = {
        position,
        size: this.eggSize,
        asset_name_index: 0,
        owner_index: 0,
        color: isGold
          ? (GOLD_EGG_COLOR.slice(0, 3) as ColorRgb)
          : Math.floor(Math.random() * EGG_COLORS.length),
        material_index: isGold ? 1 : 0,
        material_intensity: isGold ? 0 : undefined,
        components: {
          BCD_Interact: {
            bPlayInteractSound: true,
          },
        },
      };

      bricks.push(brick);
    }

    await this.omegga.loadSaveData(
      {
        bricks,
        brick_assets: [this.config.eggAsset],
        colors: EGG_COLORS,
        materials: ['BMC_Plastic', 'BMC_Metallic'],
      },
      { quiet: true }
    );

    this.curEggs = eggs.length;

    return eggs.length;
  }

  async gameStart() {
    this.resetGame();
    const eggsPlaced = await this.spawnEggs();
    this.gameStartTime = Date.now();
    this.gameTimeout = setTimeout(
      () => this.endGame(true),
      this.config.gameLength * 1000
    );
    this.gameInterval = setInterval(() => {
      const count = this.curEggs - this.foundEggs.length;
      this.omegga.broadcast(
        `<b>${count} egg${count === 1 ? '' : 's'}</b> remain${
          count === 1 ? 's' : ''
        }! ${timeFormat(
          this.gameStartTime + this.config.gameLength * 1000 - Date.now()
        )} left.`
      );
    }, 30 * 1000);
    this.omegga.broadcast(
      `<b>Egg hunt!</b> <color="ff0">${eggsPlaced} eggs</color> have been placed. Whoever finds the most wins!`
    );
  }

  async init() {
    this.resetGame();

    this.eggSize =
      this.config.eggSize.length === 0
        ? [0, 0, 0]
        : (this.config.eggSize.split(',').map(Number) as Vector);

    this.eggs = await this.store.get('eggs');
    if (!this.eggs) {
      this.eggs = [];
      await this.storeEggs();
    }

    this.players = {};

    this.omegga.on(
      'cmd:egghunt',
      async (speaker: string, subcommand: string, ...args: string[]) => {
        if (!subcommand || subcommand.length === 0) {
          this.omegga.whisper(speaker, `<color="f00">Specify a subcommand!</>`);
        }

        const player = this.omegga.getPlayer(speaker);
        if (subcommand === 'load') {
          if (!this.isAuthed(player)) return;

          this.eggs = [];
          const data = await this.omegga.getSaveData();
          if (data.version !== 10) return;
          for (const brick of data.bricks) {
            if (
              data.brick_assets[brick.asset_name_index] ===
                this.config.eggAsset &&
              data.materials[brick.material_index] === TEMPLATE_EGG_MATERIAL &&
              brick.material_intensity === TEMPLATE_EGG_MATERIAL_INTENSITY &&
              eq(
                TEMPLATE_EGG_COLOR,
                typeof brick.color === 'number'
                  ? data.colors[brick.color]
                  : brick.color
              ) &&
              eq(brick.size, this.eggSize)
            ) {
              this.eggs.push(brick.position);
            }
          }

          await this.storeEggs();
          this.omegga.whisper(
            player,
            'Stored ' +
              this.eggs.length +
              ' egg' +
              (this.eggs.length === 1 ? '' : 's') +
              '.'
          );
        } else if (subcommand === 'delete') {
          if (!this.isAuthed(player)) return;

          for (const position of this.eggs) {
            this.omegga.clearRegion({ center: position, extent: this.eggSize });
          }

          this.omegga.whisper(speaker, 'Deleted all eggs.');
          this.endGame(null, true);
          clearTimeout(this.autorestartTimeout);
        } else if (subcommand === 'start') {
          if (!this.isAuthed(player)) return;

          this.gameStart();
        } else if (subcommand === 'stop') {
          if (this.autorestartTimeout) {
            clearTimeout(this.autorestartTimeout);
            this.autorestartTimeout = undefined;
          }

          this.endGame(null, true);
        } else if (subcommand === 'insert') {
          if (!this.isAuthed(player)) return;

          const bricks: Brick[] = [];
          for (const position of this.eggs) {
            bricks.push({
              position,
              size: this.eggSize,
              asset_name_index: 0,
              material_index: 0,
              material_intensity: TEMPLATE_EGG_MATERIAL_INTENSITY,
              color: TEMPLATE_EGG_COLOR as ColorRgb,
              owner_index: 1,
            });
          }

          await this.omegga.loadSaveData(
            {
              bricks,
              brick_assets: [this.config.eggAsset],
              materials: [TEMPLATE_EGG_MATERIAL],
              brick_owners: [
                { id: player.id, name: player.name, bricks: this.eggs.length },
              ],
            },
            { quiet: true }
          );
          this.omegga.whisper(
            speaker,
            `Reinserted ${this.eggs.length} template egg${
              this.eggs.length === 1 ? '' : 's'
            }.`
          );
        } else {
          this.omegga.whisper(
            speaker,
            `<color="f00">Unknown egg hunt command <code>${subcommand}</>.</>`
          );
        }
      }
    );

    this.omegga.on('interact', async ({ player, position }) => {
      if (this.eggs.find(p => eq(p, position))) {
        this.eggFind(player, position);
      }
    });

    return { registeredCommands: ['egghunt'] };
  }

  async stop() {
    // Anything that needs to be cleaned up...
  }
}
