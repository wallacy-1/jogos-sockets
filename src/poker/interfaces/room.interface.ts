import { PlayerInterface } from './player.interface';

export enum RoomStatus {
  REVEAL = 'REVEAL',
  VOTING = 'VOTING',
}

export interface RoomInterface {
  id: string;
  status: RoomStatus;
  players: Map<string, PlayerInterface>;
}

export interface RoomDataFrontInterface extends Omit<RoomInterface, 'players'> {
  players: PlayerInterface[];
  minChoice?: number;
  maxChoice?: number;
  averageChoice?: number;
}
