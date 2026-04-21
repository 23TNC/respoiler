// pixijs/src/spacetime/debug_data.ts

import {
  type CardId,
  type PlayerId,
  type ZoneId,
  type ServerCard,
  type ServerPlayer,
  type ServerAction,
  type ServerZone,
  server_cards,
  server_players,
  server_actions,
  server_zones,
  client_cards,
  setViewedId,
  setObserverId,
  clearSelectedState,
  upsertClientCard,
} from './data';

function clearRecord<T>(record: Record<number, T>): void {
  for (const key in record) {
    delete record[Number(key)];
  }
}

export function bootstrap(): void {
  
  clearRecord(server_cards);
  clearRecord(server_players);
  clearRecord(server_actions);
  clearRecord(server_zones);
  clearRecord(client_cards);

  setViewedId(1);
  setObserverId(1);

  const cards: ServerCard[] = [
    { card_id: 1, definition: 20481, link: 0, flags: 0, zone: 0, position: 0 },
    { card_id: 2, definition: 4097, link: 1, flags: 0, zone: 0, position: 0 },
    { card_id: 3, definition: 4098, link: 1, flags: 0, zone: 0, position: 0 },
    { card_id: 4, definition: 4099, link: 1, flags: 0, zone: 0, position: 0 },
    { card_id: 5, definition: 8193, link: 1, flags: 0, zone: 0, position: 0 },
    { card_id: 6, definition: 8193, link: 1, flags: 0, zone: 0, position: 0 },
    { card_id: 7, definition: 4097, link: 1, flags: 0, zone: 1, position: 0 },
    { card_id: 8, definition: 24578, link: 0, flags: 0, zone: 1, position: 1 },
    { card_id: 9, definition: 8194, link: 1, flags: 0, zone: 0, position: 0 },
    { card_id: 10, definition: 8195, link: 1, flags: 0, zone: 0, position: 0 },
  ];

  const players: ServerPlayer[] = [
    { player_id: 1, name: 'player1', card_id: 1, zone: 1, position: 0 },
  ];

  const actions: ServerAction[] = [];

  const zones: ServerZone[] = [
    {
      zone: 1,
      t_0: 72340172838076673n,
      t_1: 72340172838076673n,
      t_2: 72340172838076673n,
      t_3: 72340172838076673n,
      t_4: 72340172838076673n,
      t_5: 72340172838076673n,
      t_6: 72340172838076673n,
      t_7: 72340172838076673n,
    },
    {
      zone: 4293918721,
      t_0: 72340172838076673n,
      t_1: 72340172838076673n,
      t_2: 72340172838076673n,
      t_3: 72340172838076673n,
      t_4: 72340172838076673n,
      t_5: 72340172838076673n,
      t_6: 72340172838076673n,
      t_7: 72340172838076673n,
    },
    {
      zone: 1048321,
      t_0: 72340172838076673n,
      t_1: 72340172838076673n,
      t_2: 72340172838076673n,
      t_3: 72340172838076673n,
      t_4: 72340172838076673n,
      t_5: 72340172838076673n,
      t_6: 72340172838076673n,
      t_7: 72340172838076673n,
    },
  ];

  for (const card of cards) {
    server_cards[card.card_id as CardId] = card;
    
  }

  for (const player of players) {
    server_players[player.player_id as PlayerId] = player;
  }

  for (const action of actions) {
    server_actions[action.card_id as CardId] = action;
  }

  for (const zone of zones) {
    server_zones[zone.zone as ZoneId] = zone;
  }

  for (const key in server_cards) {
    const card_id = Number(key) as CardId;
    upsertClientCard(server_cards[card_id]);
  }

  
  clearSelectedState();
}
