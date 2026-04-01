import { Application, Container, Graphics, Text } from 'pixi.js';

const CARD_WIDTH = 120;
const CARD_HEIGHT = 170;
const TILE_RADIUS = CARD_WIDTH * 2;
const GRID_SIZE = CARD_WIDTH / 2;
const SLOT_GAP = CARD_WIDTH * 0.85;

function snapToGrid(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function snapPoint(point) {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) };
}

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function asRecipeKey(input) {
  return input.join('|');
}

class TweenManager {
  constructor() {
    this.tweens = [];
  }

  to(target, props, durationMs, onComplete) {
    const start = Object.fromEntries(Object.keys(props).map((k) => [k, target[k]]));
    this.tweens.push({ target, props, start, elapsed: 0, durationMs, onComplete });
  }

  update(deltaMs) {
    this.tweens = this.tweens.filter((tween) => {
      tween.elapsed += deltaMs;
      const progress = Math.min(1, tween.elapsed / tween.durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      Object.entries(tween.props).forEach(([key, value]) => {
        tween.target[key] = tween.start[key] + (value - tween.start[key]) * eased;
      });

      if (progress >= 1) {
        tween.onComplete?.();
        return false;
      }
      return true;
    });
  }
}

class CardSprite extends Container {
  constructor(cardType, catalog) {
    super();
    this.cardType = cardType;
    this.catalog = catalog;
    this.widthPx = CARD_WIDTH;
    this.heightPx = CARD_HEIGHT;
    this.originalPosition = { x: 0, y: 0 };
    this.rebuild();
  }

  rebuild() {
    this.removeChildren();
    const def = this.catalog.get(this.cardType);
    const bg = new Graphics();
    bg.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 12);
    bg.fill(def?.color || 0xffffff);
    bg.stroke({ color: 0x111827, width: 3 });

    const label = new Text({
      text: def?.name ?? this.cardType,
      style: {
        fill: '#111827',
        fontSize: 22,
        fontWeight: '700',
        align: 'center'
      }
    });
    label.anchor.set(0.5);

    this.addChild(bg, label);
  }

  setOriginalPosition(x, y) {
    this.originalPosition = { x, y };
  }
}

class ActionTile extends Container {
  constructor(id, label, recipes) {
    super();
    this.id = id;
    this.label = label;
    this.recipes = recipes;
    this.slottedCards = [];
    this.expectedInput = [];
    this.runningRecipe = null;
    this.progressPct = 0;

    this.base = new Graphics();
    this.progressRing = new Graphics();
    this.slotLayer = new Container();
    this.labelText = new Text({
      text: label,
      style: {
        fill: '#f3f4f6',
        fontSize: 26,
        fontWeight: '700'
      }
    });
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, -10);

    this.addChild(this.base, this.progressRing, this.slotLayer, this.labelText);
    this.computeExpectedInput();
    this.draw();
  }

  getSlotPosition(index, total = this.expectedInput.length || 1) {
    const offsetStart = -((total - 1) * SLOT_GAP) / 2;
    return { x: offsetStart + index * SLOT_GAP, y: 70 };
  }

  draw() {
    this.base.clear();
    this.base.circle(0, 0, TILE_RADIUS);
    this.base.fill(0x1f2937);
    this.base.stroke({ color: 0x94a3b8, width: 5 });

    this.progressRing.clear();
    if (this.progressPct > 0) {
      this.progressRing.arc(0, 0, TILE_RADIUS + 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.progressPct);
      this.progressRing.stroke({ color: 0x22c55e, width: 12 });
    }

    this.slotLayer.removeChildren();
    const total = this.expectedInput.length || 1;
    for (let i = 0; i < total; i += 1) {
      const slot = new Graphics();
      const pos = this.getSlotPosition(i, total);
      slot.roundRect(-CARD_WIDTH * 0.35, -CARD_HEIGHT * 0.2, CARD_WIDTH * 0.7, CARD_HEIGHT * 0.4, 8);
      slot.fill(0x9ca3af);
      slot.alpha = 0.75;
      slot.position.set(pos.x, pos.y);
      this.slotLayer.addChild(slot);

      if (!this.slottedCards[i] && this.expectedInput[i]) {
        const hint = new Text({
          text: this.expectedInput[i],
          style: { fill: '#111827', fontSize: 14, fontWeight: '700' }
        });
        hint.anchor.set(0.5);
        hint.position.set(pos.x, pos.y);
        this.slotLayer.addChild(hint);
      }
    }
  }

  computeExpectedInput() {
    if (this.runningRecipe) {
      this.expectedInput = [...this.runningRecipe.input];
      return;
    }

    const current = this.slottedCards.map((c) => c.cardType);
    if (current.length === 0) {
      const shortest = [...this.recipes].sort((a, b) => a.input.length - b.input.length)[0];
      this.expectedInput = shortest?.input ? [...shortest.input] : [];
      return;
    }

    const partialMatches = this.recipes.filter((recipe) =>
      current.every((input, index) => recipe.input[index] === input)
    );

    if (partialMatches.length > 0) {
      this.expectedInput = [...partialMatches.sort((a, b) => a.input.length - b.input.length)[0].input];
    } else {
      this.expectedInput = [...current];
    }
  }

  validateNextCard(cardType) {
    if (this.runningRecipe) {
      return false;
    }
    const proposed = [...this.slottedCards.map((c) => c.cardType), cardType];
    return this.recipes.some((recipe) => proposed.every((item, idx) => recipe.input[idx] === item));
  }

  slotCard(card) {
    this.slottedCards.push(card);
    this.computeExpectedInput();
    this.draw();
    const index = this.slottedCards.length - 1;
    const slotPos = this.getSlotPosition(index, this.expectedInput.length || this.slottedCards.length);
    return slotPos;
  }

  tryStartRecipe() {
    const key = asRecipeKey(this.slottedCards.map((c) => c.cardType));
    const recipe = this.recipes.find((r) => asRecipeKey(r.input) === key);
    if (recipe && recipe.input.length === this.slottedCards.length) {
      this.runningRecipe = recipe;
      this.progressPct = 0;
      this.computeExpectedInput();
      this.draw();
      return recipe;
    }
    return null;
  }

  tick(seconds) {
    if (!this.runningRecipe) {
      return null;
    }

    this.progressPct = Math.min(1, this.progressPct + seconds / this.runningRecipe.time);
    this.draw();
    if (this.progressPct >= 1) {
      const completed = this.runningRecipe;
      this.runningRecipe = null;
      this.progressPct = 0;
      this.computeExpectedInput();
      this.draw();
      return completed;
    }
    return null;
  }

  clearSlots() {
    const cards = [...this.slottedCards];
    this.slottedCards = [];
    this.computeExpectedInput();
    this.draw();
    return cards;
  }
}

export class CardGame {
  constructor(rootElement, dataProvider) {
    this.rootElement = rootElement;
    this.dataProvider = dataProvider;
    this.app = new Application();
    this.tweens = new TweenManager();
    this.cardCatalog = new Map();
    this.cards = [];
    this.dragContext = null;
  }

  async init() {
    await this.app.init({
      background: '#111827',
      resizeTo: this.rootElement,
      antialias: true
    });
    this.rootElement.appendChild(this.app.canvas);

    const [cards, recipes, initialCards] = await Promise.all([
      this.dataProvider.getCards(),
      this.dataProvider.getRecipes(),
      this.dataProvider.getInitialPlayerCards()
    ]);

    cards.forEach((c) => this.cardCatalog.set(c.id, { ...c, color: c.color }));

    const workRecipes = recipes.filter((recipe) => recipe.tile === 'work');
    const tilePos = snapPoint({ x: this.app.screen.width * 0.55, y: this.app.screen.height * 0.48 });
    this.workTile = new ActionTile('work', 'Work', workRecipes);
    this.workTile.position.set(tilePos.x, tilePos.y);
    this.app.stage.addChild(this.workTile);

    initialCards.forEach((id, idx) => {
      const x = snapToGrid(200 + idx * (CARD_WIDTH + 20));
      const y = snapToGrid(this.app.screen.height - CARD_HEIGHT);
      this.createCard(id, x, y, { spawnFrom: null });
    });

    this.app.ticker.add((ticker) => {
      const deltaMs = ticker.deltaMS;
      this.tweens.update(deltaMs);
      const finished = this.workTile.tick(deltaMs / 1000);
      if (finished) {
        this.onRecipeComplete(this.workTile, finished);
      }
    });
  }

  createCard(cardType, x, y, { spawnFrom } = {}) {
    const card = new CardSprite(cardType, this.cardCatalog);
    card.position.set(spawnFrom?.x ?? x, spawnFrom?.y ?? y);
    card.setOriginalPosition(x, y);
    card.eventMode = 'static';
    card.cursor = 'pointer';

    card.on('pointerdown', (event) => {
      if (this.workTile.runningRecipe && this.workTile.slottedCards.includes(card)) {
        return;
      }
      const local = event.getLocalPosition(this.app.stage);
      this.dragContext = {
        card,
        offsetX: card.x - local.x,
        offsetY: card.y - local.y,
        from: { ...card.originalPosition }
      };
      this.app.stage.addChild(card);
      card.alpha = 0.9;
      card.scale.set(1.05);
    });

    card.on('pointermove', (event) => {
      if (!this.dragContext || this.dragContext.card !== card) {
        return;
      }
      const local = event.getLocalPosition(this.app.stage);
      card.position.set(local.x + this.dragContext.offsetX, local.y + this.dragContext.offsetY);
    });

    const endDrag = () => {
      if (!this.dragContext || this.dragContext.card !== card) {
        return;
      }
      card.alpha = 1;
      card.scale.set(1);
      this.handleDrop(card, this.dragContext.from);
      this.dragContext = null;
    };

    card.on('pointerup', endDrag);
    card.on('pointerupoutside', endDrag);

    this.cards.push(card);
    this.app.stage.addChild(card);
    if (spawnFrom) {
      this.tweens.to(card, { x, y }, 450);
    }
    return card;
  }

  handleDrop(card, originalPosition) {
    const worldPos = { x: card.x, y: card.y };
    const tileCenter = { x: this.workTile.x, y: this.workTile.y };
    const droppedOnTile = pointDistance(worldPos, tileCenter) <= TILE_RADIUS;

    if (!droppedOnTile || !this.workTile.validateNextCard(card.cardType)) {
      this.tweens.to(card, { x: originalPosition.x, y: originalPosition.y }, 350);
      return;
    }

    const slotPos = this.workTile.slotCard(card);
    const targetX = this.workTile.x + slotPos.x;
    const targetY = this.workTile.y + slotPos.y;

    this.tweens.to(card, { x: targetX, y: targetY }, 250, () => {
      const recipe = this.workTile.tryStartRecipe();
      if (recipe) {
        // recipe now running
      }
    });
  }

  onRecipeComplete(tile, recipe) {
    const usedCards = tile.clearSlots();
    usedCards.forEach((card) => {
      this.tweens.to(card, { x: card.originalPosition.x, y: card.originalPosition.y }, 500);
    });

    const spawn = { x: tile.x, y: tile.y };
    const target = this.findOpenCardPosition();
    this.createCard(recipe.output, target.x, target.y, { spawnFrom: spawn });
  }

  findOpenCardPosition() {
    const minX = CARD_WIDTH;
    const minY = CARD_HEIGHT;
    const maxX = this.app.screen.width - CARD_WIDTH;
    const maxY = this.app.screen.height - CARD_HEIGHT;

    for (let y = minY; y <= maxY; y += GRID_SIZE) {
      for (let x = minX; x <= maxX; x += GRID_SIZE) {
        const occupied = this.cards.some((card) => pointDistance({ x, y }, { x: card.originalPosition.x, y: card.originalPosition.y }) < CARD_WIDTH * 0.9);
        if (!occupied && pointDistance({ x, y }, { x: this.workTile.x, y: this.workTile.y }) > TILE_RADIUS + CARD_WIDTH) {
          return { x, y };
        }
      }
    }

    return snapPoint({ x: minX, y: maxY });
  }
}
