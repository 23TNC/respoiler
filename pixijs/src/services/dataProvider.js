import cardDefinitions from '../data/cards.json';
import recipeDefinitions from '../data/recipes.json';

class LocalDataProvider {
  async getCards() {
    return cardDefinitions;
  }

  async getRecipes() {
    return recipeDefinitions;
  }

  async getInitialPlayerCards() {
    return ['might'];
  }
}

class SpacetimeDbProvider {
  constructor() {
    this.localFallback = new LocalDataProvider();
  }

  async getCards() {
    // Future: fetch static card metadata from SpacetimeDB.
    return this.localFallback.getCards();
  }

  async getRecipes() {
    // Future: fetch recipe table from SpacetimeDB.
    return this.localFallback.getRecipes();
  }

  async getInitialPlayerCards() {
    // Future: fetch player's dynamic inventory from SpacetimeDB.
    return this.localFallback.getInitialPlayerCards();
  }
}

export function createDataProvider(mode = import.meta.env.VITE_DATA_MODE || 'local') {
  if (mode === 'spacetimedb') {
    return new SpacetimeDbProvider();
  }
  return new LocalDataProvider();
}
