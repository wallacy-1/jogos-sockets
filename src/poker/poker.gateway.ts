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

enum RoomStatus {
  REVEAL = 'REVEAL',
  VOTING = 'VOTING',
}

interface RoomInterface {
  id: string;
  status: RoomStatus;
  players: Map<string, PlayerInterface>;
}

interface PlayerInterface {
  id: string;
  name: string;
  canVote: boolean;
  choice: number | boolean;
  role?: PlayerRoles;
}

enum PlayerRoles {
  ADMIN = 'ADMIN',
  COMMON = 'COMMON',
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

    this.roomMap.set(roomId, {
      id: roomId,
      status: RoomStatus.VOTING,
      players: new Map(),
    });
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
        canVote: true,
        choice: false,
        role: isFirstPlayer ? PlayerRoles.ADMIN : PlayerRoles.COMMON,
      };

      room.players.set(client.id, newPlayer);

      client.join(roomId);

      this.roomUpdate(room);
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

  @SubscribeMessage('changeName')
  handleChangeName(
    @MessageBody() data: { targetId: string; newName: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.getPlayerRoom(client.id);
    if (!room) return;

    let player = room.players.get(client.id);

    if (data.targetId !== client.id && player?.role === PlayerRoles.ADMIN) {
      player = room.players.get(data.targetId);
    }

    const nameNoWhiteSpace = data.newName.trim();

    if (player && nameNoWhiteSpace) {
      player.name = nameNoWhiteSpace;

      this.roomUpdate(room);
    }
  }

  @SubscribeMessage('updateVotingStatus')
  handleUpdateVotingStatus(
    @MessageBody() data: { targetId: string; canVote: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.getPlayerRoom(client.id);
    if (!room) return;

    const admin = room.players.get(client.id);
    if (admin?.role === PlayerRoles.ADMIN) {
      const targetPlayer = room.players.get(data.targetId);
      if (targetPlayer) {
        targetPlayer.canVote = data.canVote;

        if (room.status !== RoomStatus.REVEAL) {
          targetPlayer.choice = false;
        }

        this.roomUpdate(room);
      } else {
        client.emit('error', 'Player not found');
      }
    } else {
      client.emit('error', 'Not authorized');
    }
  }

  @SubscribeMessage('transferAdmin')
  handleTransferAdmin(
    @MessageBody() targetId: string,
    @ConnectedSocket() client: Socket,
  ) {
    console.log(`handleTransferAdmin - client.id: ${client.id}`);
    const room = this.getPlayerRoom(client.id);
    if (!room || !targetId) return;

    const oldAdmin = room.players.get(client.id);
    if (oldAdmin?.role === PlayerRoles.ADMIN) {
      const newAdmin = room.players.get(targetId);

      if (newAdmin) {
        oldAdmin.role = PlayerRoles.COMMON;
        newAdmin.role = PlayerRoles.ADMIN;

        this.roomUpdate(room);
      }
    }
  }

  @SubscribeMessage('chooseCard')
  handleChooseCard(
    @MessageBody() choice: number,
    @ConnectedSocket() client: Socket,
  ) {
    console.log(`handleChooseCard - client.id: ${client.id}`);
    const room = this.getPlayerRoom(client.id);
    if (!room || !choice || room.status === RoomStatus.REVEAL) return;

    const player = room.players.get(client.id);
    if (player?.canVote && player.choice !== choice) {
      player.choice = choice;
      this.roomUpdate(room);
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
        player.choice = false;
      });

      room.status = RoomStatus.VOTING;
      this.roomUpdate(room);
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
      room.status = RoomStatus.REVEAL;

      this.roomUpdate(room);
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

  private roomUpdate(room: RoomInterface) {
    const returnRoom = { ...room, players: [] };
    for (const player of room.players.values()) {
      const hideChoice = player.choice ? true : false;
      const newPlayer = {
        ...player,
        choice: room.status === RoomStatus.REVEAL ? player.choice : hideChoice,
      };

      if (player.role === PlayerRoles.ADMIN) {
        returnRoom.players.unshift(newPlayer);
      } else {
        returnRoom.players.push(newPlayer);
      }
    }
    this.server.in(room.id).emit('roomUpdate', returnRoom);
  }
}
