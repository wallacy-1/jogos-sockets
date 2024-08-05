import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
} from '@nestjs/websockets';
import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';

interface RoomInterface {
  id: string;
}

interface PlayerInterface {
  id: string;
  roomId?: string;
  choice?: number;
  role?: PlayerRoles;
}

enum PlayerRoles {
  ADMIN,
  OBSERVER,
  COMMON,
}

@WebSocketGateway({ cors: true })
export class PokerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private roomMap: Map<string, RoomInterface> = new Map();
  private playerMap: Map<string, PlayerInterface> = new Map();

  handleConnection(client: Socket) {
    console.log(`handleConnection - client.id: ${client.id}`);

    this.playerMap.set(client.id, {
      id: client.id,
      roomId: null,
      choice: null,
      role: null,
    });
  }

  handleDisconnect(client: Socket) {
    console.log(`handleDisconnect - client.id: ${client.id}`);

    const player = this.playerMap.get(client.id);
    if (!player) return;

    this.playerMap.delete(player.id);

    if (player.roomId) {
      if (player.role === PlayerRoles.ADMIN) {
        this.server.to(player.roomId).emit('adminDisconnected');
        this.server.in(player.roomId).disconnectSockets();
      } else {
        this.server.socketsLeave(player.roomId);
        this.server.to(player.roomId).emit('playerDisconnected', player.id);
      }
    }
  }

  @SubscribeMessage('createRoom')
  handleCreateRoom(client: Socket) {
    const roomId = randomUUID();
    console.log(`handleCreateRoom - adminId: ${client.id} roomId: ${roomId}`);

    this.roomMap.set(roomId, { id: roomId });

    this.playerMap.set(client.id, {
      id: client.id,
      roomId,
      choice: null,
      role: PlayerRoles.ADMIN,
    });

    this.server.socketsJoin(roomId);
    this.server.to(roomId).emit('newRoom', roomId);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(@MessageBody() roomId: string, client: Socket) {
    console.log(`handleJoinRoom - client.id: ${client.id} roomId: ${roomId}`);

    if (this.roomMap.has(roomId)) {
      console.log(
        `handleJoinRoom - room with id: ${roomId} found, including player: ${client.id}.`,
      );

      this.server.socketsJoin(roomId);

      this.playerMap.set(client.id, {
        id: client.id,
        roomId,
        choice: null,
        role: PlayerRoles.COMMON,
      });

      this.server.to(roomId).emit('newPlayer', client.id);
    } else {
      console.log(`handleJoinRoom - room with id: ${roomId} not found.`);
    }
  }

  @SubscribeMessage('kickPlayer')
  handleKickPlayer(@MessageBody() targetId: string, client: Socket) {
    const admin = this.playerMap.get(client.id);
    if (admin?.role === PlayerRoles.ADMIN) {
      console.log(
        `handleKickPlayer - targetId: ${targetId} player: ${admin.id} playerRole: ${admin.role}`,
      );

      const targetPlayer = this.playerMap.get(targetId);
      if (targetPlayer?.roomId === admin.roomId) {
        this.server.socketsLeave(targetPlayer.roomId);
        this.playerMap.delete(targetId);

        this.server.to(admin.roomId).emit('playerKicked', targetPlayer.id);
        console.log(`handleKickPlayer - success`);
      } else {
        console.log(`handleKickPlayer - target player not found.`);
      }
    } else {
      console.log(`handleKickPlayer - client is not an admin.`);
    }
  }

  @SubscribeMessage('chooseCard')
  handleChooseCard(@MessageBody() choice: number, client: Socket) {
    const player = this.playerMap.get(client.id);
    if (player && player.role !== PlayerRoles.OBSERVER) {
      player.choice = choice;

      this.server.to(player.roomId).emit('playerHasChoose', player.id);
    } else {
      console.log(`handleChooseCard - client is not allowed to choose card.`);
    }
  }

  @SubscribeMessage('reset')
  handleResetCards(@MessageBody() roomId: string) {
    this.playerMap.forEach((player) => {
      if (player.roomId === roomId) player.choice = null;
    });

    this.server.to(roomId).emit('newRound');
  }

  @SubscribeMessage('revealCards')
  handleRevealCards(@MessageBody() roomId: string) {
    console.log(`handleRevealCards - roomId: ${roomId}`);

    const players = Array.from(this.playerMap.values()).filter(
      (player) => player.roomId === roomId,
    );

    this.server.to(roomId).emit('revealCards', players);
  }
}
