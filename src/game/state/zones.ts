import { SHOP_ROOMS, shopRoom } from '@/game/data';
import { inHouseArea, tileAt } from '@/game/sim/farm-map';

/**
 * Which space a world point is in. The world is one diorama ('out': the town and the farm), and
 * every building you can enter has its rooms off the map: the house's ('house') and each shop's
 * (its id). Indoors you see only your own space, and only the friends who are in it with you.
 */
export type Zone = 'out' | 'house' | string;

export function zoneAt(x: number, z: number): Zone {
  if (inHouseArea(...tileAt(x, z))) return 'house';
  for (const id of Object.keys(SHOP_ROOMS)) {
    const r = shopRoom(id);
    if (x > r.x0 - 1 && x < r.x1 + 1 && z > r.z0 - 1 && z < r.z1 + 1) return id;
  }
  return 'out';
}
