import { Injectable } from '@nestjs/common';
import { RoomInterface, RoomStatus } from './interfaces';
import { randomUUID } from 'crypto';

@Injectable()
export class PokerService {
  private readonly roomMap: Map<string, RoomInterface> = new Map();

  createRoom(): string {
    const roomId = randomUUID();
    this.roomMap.set(roomId, {
      id: roomId,
      status: RoomStatus.VOTING,
      players: new Map(),
    });
    return roomId;
  }

  getRoom(roomId: string): RoomInterface | undefined {
    return this.roomMap.get(roomId);
  }

  revealCards(roomId: string): RoomInterface | undefined {
    return this.roomMap.get(roomId);
  }

  roomExists(roomId: string): boolean {
    return this.roomMap.has(roomId);
  }

  deleteRoom(roomId: string): void {
    this.roomMap.delete(roomId);
  }

  getPlayerRoom(playerId: string): RoomInterface | undefined {
    for (const room of this.roomMap.values()) {
      if (room.players.has(playerId)) {
        return room;
      }
    }
    return undefined;
  }

  isPlayerNameTaken(room: RoomInterface, playerName: string): boolean {
    for (const player of room.players.values()) {
      if (player.name === playerName) {
        return true;
      }
    }
    return false;
  }

  updateRoom(room: RoomInterface) {
    this.roomMap.set(room.id, room);
  }

  removePlayerFromRoom(roomId: string, playerId: string): void {
    const room = this.roomMap.get(roomId);
    if (room) {
      room.players.delete(playerId);
      if (room.players.size === 0) {
        this.deleteRoom(roomId);
      }
    }
  }
}
