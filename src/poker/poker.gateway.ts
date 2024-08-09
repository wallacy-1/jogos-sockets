import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';

interface RoomInterface {
  id: string;
  players: Map<string, PlayerInterface>;
}

interface PlayerInterface {
  id: string;
  name: string;
  choice?: number;
  role?: PlayerRoles;
}

enum PlayerRoles {
  ADMIN,
  OBSERVER,
  COMMON,
}

@WebSocketGateway({ cors: true, transports: ['websocket'] })
export class PokerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private roomMap: Map<string, RoomInterface> = new Map();

  handleConnection(@ConnectedSocket() client: Socket) {
    console.log(`handleConnection - client.id: ${client.id}`);
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    console.log(`handleDisconnect - client.id: ${client.id}`);

    const room = this.getPlayerRoom(client.id);
    if (!room) return;

    const player = room.players.get(client.id);
    room.players.delete(client.id);

    if (player?.role === PlayerRoles.ADMIN) {
      this.server.to(room.id).emit('adminDisconnected');
      this.server.in(room.id).disconnectSockets();
      this.roomMap.delete(room.id);
    } else {
      this.server.to(room.id).emit('playerLeft', client.id);
    }
  }

  @SubscribeMessage('createRoom')
  handleCreateRoom(@ConnectedSocket() client: Socket) {
    const roomId = randomUUID();
    console.log(`handleCreateRoom - roomId: ${roomId}`);

    this.roomMap.set(roomId, { id: roomId, players: new Map() });
    client.emit('newRoom', roomId);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() data: { roomId: string; playerName: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { roomId, playerName } = data;
    console.log(`handleJoinRoom - client.id: ${client.id} roomId: ${roomId}`);

    const room = this.roomMap.get(roomId);

    if (room) {
      console.log(
        `handleJoinRoom - room with id: ${roomId} found, including player: ${client.id}.`,
      );

      const isFirstPlayer = room.players.size === 0;
      const newPlayer = {
        id: client.id,
        name: playerName ?? 'guest',
        choice: null,
        role: isFirstPlayer ? PlayerRoles.ADMIN : PlayerRoles.COMMON,
      };

      room.players.set(client.id, newPlayer);

      client.join(roomId);

      client.emit('playerData', newPlayer);

      const players = [];
      for (const player of room.players.values()) {
        players.push({
          id: player.id,
          name: player.name,
          role: player.role,
          choice: player.choice ? true : false,
        });
      }

      this.server.in(roomId).emit('newPlayer', players);
    } else {
      client.emit('error', 'Room not found');
    }
  }

  @SubscribeMessage('kickPlayer')
  handleKickPlayer(
    @MessageBody() targetId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.getPlayerRoom(client.id);
    if (!room) return;

    const admin = room.players.get(client.id);
    if (admin?.role === PlayerRoles.ADMIN && admin.id !== targetId) {
      console.log(
        `handleKickPlayer - targetId: ${targetId} player: ${admin.id} playerRole: ${admin.role}`,
      );

      const targetPlayer = room.players.get(targetId);
      if (targetPlayer) {
        room.players.delete(targetId);

        this.server.to(room.id).emit('playerKicked', targetId);
      } else {
        client.emit('error', 'Player not found');
      }
    } else {
      client.emit('error', 'Not authorized');
    }
  }

  @SubscribeMessage('chooseCard')
  handleChooseCard(
    @MessageBody() choice: number,
    @ConnectedSocket() client: Socket,
  ) {
    console.log(`handleChooseCard - client.id: ${client.id}`);
    const room = this.getPlayerRoom(client.id);
    if (!room || !choice) return;

    const player = room.players.get(client.id);
    if (player?.role !== PlayerRoles.OBSERVER && player.choice !== choice) {
      player.choice = choice;
      this.server.to(room.id).emit('playerSelectedCard', client.id);
    }
  }

  @SubscribeMessage('reset')
  handleResetCards(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.roomMap.get(roomId);
    if (!room) return;

    const player = room.players.get(client.id);
    if (player?.role === PlayerRoles.ADMIN) {
      room.players.forEach((player) => {
        player.choice = null;
      });

      this.server.to(roomId).emit('newRound');
    } else {
      client.emit('error', 'Not authorized');
    }
  }

  @SubscribeMessage('revealCards')
  handleRevealCards(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    console.log(`handleRevealCards - roomId: ${roomId}`);
    const room = this.roomMap.get(roomId);
    console.log(`handleRevealCards - room: ${room}`);
    if (!room) return;

    const admin = room.players.get(client.id);

    if (admin?.role === PlayerRoles.ADMIN) {
      this.server
        .to(roomId)
        .emit('revealCards', Array.from(room.players.values()));
    } else {
      client.emit('error', 'Not authorized');
    }
  }

  private getPlayerRoom(playerId: string): RoomInterface | undefined {
    for (const room of this.roomMap.values()) {
      if (room.players.has(playerId)) {
        return room;
      }
    }
    return undefined;
  }
}
