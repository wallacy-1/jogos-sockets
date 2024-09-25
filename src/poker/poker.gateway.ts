import { Logger } from '@nestjs/common';
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
import {
  RoomInterface,
  PlayerRoles,
  RoomStatus,
  RoomDataFrontInterface,
} from './interfaces';

@WebSocketGateway({ cors: true, transports: ['websocket'] })
export class PokerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PokerGateway.name);

  @WebSocketServer()
  server: Server;

  private roomMap: Map<string, RoomInterface> = new Map();

  handleConnection(@ConnectedSocket() client: Socket) {
    this.logger.log(`handleConnection - connected client.id: ${client.id}`);
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`handleDisconnect - client.id: ${client.id}`);

    const room = this.getPlayerRoom(client.id);
    if (!room) return;

    const player = room.players.get(client.id);

    if (player?.role === PlayerRoles.ADMIN) {
      this.logger.warn(
        `handleDisconnect - admin disconnected, roomId: ${room.id}, playerName: ${player.name}, client.id: ${client.id}`,
      );

      this.server.to(room.id).emit('adminDisconnected');
      this.server.in(room.id).disconnectSockets();
      this.roomMap.delete(room.id);
    } else {
      room.players.delete(client.id);
      this.roomUpdate(room);
    }

    this.logger.debug(
      `handleDisconnect - Remaining players in room ${room.id}: ${room.players.size}`,
    );
  }

  @SubscribeMessage('createRoom')
  handleCreateRoom(@ConnectedSocket() client: Socket) {
    const roomId = randomUUID();
    this.logger.log(
      `handleCreateRoom - roomId: ${roomId}, client.id: ${client.id}`,
    );

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
    this.logger.log(
      `handleJoinRoom - playerName: ${playerName}, roomId: ${roomId}, client.id: ${client.id}`,
    );

    const room = this.roomMap.get(roomId);

    if (room) {
      this.logger.debug(
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
      this.logger.error(`handleJoinRoom - roomId: ${roomId} not found`);
      client.emit('error', 'Room not found');
    }
  }

  @SubscribeMessage('kickPlayer')
  handleKickPlayer(
    @MessageBody() targetId: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(
      `handleKickPlayer - targetId: ${targetId}, client.id: ${client.id}`,
    );

    const room = this.getPlayerRoom(client.id);
    if (!room) return;

    const admin = room.players.get(client.id);
    if (admin?.role === PlayerRoles.ADMIN && admin.id !== targetId) {
      this.logger.debug(
        `handleKickPlayer - targetId: ${targetId} player: ${admin.id} playerRole: ${admin.role}`,
      );

      const targetPlayer = room.players.get(targetId);
      if (targetPlayer) {
        room.players.delete(targetId);

        this.server.to(room.id).emit('playerKicked', targetId);
        this.roomUpdate(room);

        this.logger.log(
          `handleKickPlayer - player with name: ${targetPlayer.name} successfully kicked by admin ${admin.name} in room ${room.id}, clientId: ${client.id}`,
        );
      } else {
        this.logger.error(
          `handleKickPlayer - player not found, targetId: ${targetId}, client.id: ${client.id}`,
        );
        client.emit('error', 'Player not found');
      }
    } else {
      this.logger.error(
        `handleKickPlayer - User is not admin, role: ${admin?.role}, client.id: ${client.id}`,
      );
      client.emit('error', 'Not authorized');
    }
  }

  @SubscribeMessage('changeName')
  handleChangeName(
    @MessageBody() data: { targetId: string; newName: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(
      `handleChangeName - targetId: ${data?.targetId}, newName: ${data?.newName}, client.id: ${client.id}`,
    );
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
      this.logger.log(
        `handleChangeName - new name to player targetId: ${nameNoWhiteSpace}, clientId: ${client.id}`,
      );
    }
  }

  @SubscribeMessage('updateVotingStatus')
  handleUpdateVotingStatus(
    @MessageBody() data: { targetId: string; canVote: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(
      `handleUpdateVotingStatus - targetId: ${data?.targetId}, canVote: ${data?.canVote} client.id: ${client.id}`,
    );
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
        this.logger.error(
          `handleUpdateVotingStatus - Player: ${data?.targetId} not found, client.id: ${client.id}`,
        );
        client.emit('error', 'Player not found');
      }
    } else {
      this.logger.error(
        `handleUpdateVotingStatus - User is not admin, role: ${admin?.role}, client.id: ${client.id}`,
      );
      client.emit('error', 'Not authorized');
    }
  }

  @SubscribeMessage('transferAdmin')
  handleTransferAdmin(
    @MessageBody() targetId: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(
      `handleTransferAdmin - targetId: ${targetId} client.id: ${client.id}`,
    );
    const room = this.getPlayerRoom(client.id);
    if (!room || !targetId) return;

    const oldAdmin = room.players.get(client.id);
    if (oldAdmin?.role === PlayerRoles.ADMIN) {
      const newAdmin = room.players.get(targetId);

      if (newAdmin) {
        oldAdmin.role = PlayerRoles.COMMON;
        newAdmin.role = PlayerRoles.ADMIN;

        this.roomUpdate(room);

        this.logger.warn(
          `handleTransferAdmin - player: ${oldAdmin.name} successful transfer admin to player: ${newAdmin.name}, clientId: ${client.id}`,
        );
      }
    }
  }

  @SubscribeMessage('chooseCard')
  handleChooseCard(
    @MessageBody() choice: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`handleChooseCard - client.id: ${client.id}`);
    const room = this.getPlayerRoom(client.id);
    if (!room || !choice || room.status === RoomStatus.REVEAL) return;

    const player = room.players.get(client.id);
    if (player?.canVote && player.choice !== choice) {
      player.choice = choice;
      this.roomUpdate(room);

      this.logger.debug(
        `handleChooseCard - player: ${player.name}, choice: ${choice}`,
      );
    }
  }

  @SubscribeMessage('adminChangePlayerChoice')
  handleAdminChangePlayerChoice(
    @MessageBody() data: { targetId: string; choice: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(
      `handleAdminChangePlayerChoice - targetId: ${data?.targetId}, choice: ${data.choice}, client.id: ${client.id}`,
    );
    const room = this.getPlayerRoom(client.id);
    if (!room || !data.choice || room.status === RoomStatus.VOTING) return;

    const admin = room.players.get(client.id);
    if (admin?.role === PlayerRoles.ADMIN) {
      const targetPlayer = room.players.get(data.targetId);

      if (targetPlayer?.choice !== data.choice) {
        targetPlayer.previousChoiceBeforeAdminChange = targetPlayer.choice;
        targetPlayer.choice = data.choice;

        this.roomUpdate(room);
        this.logger.log(
          `handleAdminChangePlayerChoice - admin: ${admin.name} altered player ${targetPlayer.name} choice forced, client.id: ${client.id}`,
        );
      }
    }
  }

  @SubscribeMessage('reset')
  handleResetCards(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(
      `handleResetCards - roomId: ${roomId} client.id: ${client.id}`,
    );
    const room = this.roomMap.get(roomId);
    if (!room) return;

    const admin = room.players.get(client.id);
    if (admin?.role === PlayerRoles.ADMIN) {
      room.players.forEach((player) => {
        player.choice = false;
        player.previousChoiceBeforeAdminChange = false;
      });

      room.status = RoomStatus.VOTING;
      this.roomUpdate(room);
    } else {
      this.logger.error(
        `handleResetCards - User is not admin, role: ${admin?.role}, client.id: ${client.id}`,
      );
      client.emit('error', 'Not authorized');
    }
  }

  @SubscribeMessage('revealCards')
  handleRevealCards(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(
      `handleRevealCards - roomId: ${roomId}, client.id: ${client.id}`,
    );
    const room = this.roomMap.get(roomId);
    if (!room) return;

    const admin = room.players.get(client.id);

    if (admin?.role === PlayerRoles.ADMIN) {
      room.status = RoomStatus.REVEAL;

      this.roomUpdate(room);
    } else {
      this.logger.error(
        `handleRevealCards - User is not admin, role: ${admin?.role}, client.id: ${client.id}`,
      );
      client.emit('error', 'Not authorized');
    }
  }

  private getPlayerRoom(playerId: string): RoomInterface | undefined {
    this.logger.verbose(`Function getPlayerRoom - playerId: ${playerId}`);

    for (const room of this.roomMap.values()) {
      if (room.players.has(playerId)) {
        this.logger.verbose(
          `getPlayerRoom - room FOUND, roomId: ${room.id}, status: ${room.status}, players: ${room.players.size}`,
        );
        return room;
      }
    }

    this.logger.verbose(`Function getPlayerRoom - room NOT FOUND`);
    return undefined;
  }

  private roomUpdate(room: RoomInterface) {
    const returnRoom: RoomDataFrontInterface = {
      ...room,
      players: [],
    };

    for (const player of room.players.values()) {
      const hiddenChoice = player.choice ? true : false;

      returnRoom.players.push({
        ...player,
        choice:
          room.status === RoomStatus.REVEAL ? player.choice : hiddenChoice,
      });
    }

    if (room.status === RoomStatus.REVEAL) {
      this.calculateRoomStats(returnRoom);
    }

    this.server.in(room.id).emit('roomUpdate', returnRoom);

    this.logger.verbose(
      `Function getPlayerRoom - roomId: ${room.id}, status: ${room.status}, players: ${room.players.size}`,
    );
  }

  private calculateRoomStats(room: RoomDataFrontInterface) {
    let sum = 0;
    let count = 0;

    room.minChoice = null;
    room.maxChoice = null;

    for (const player of room.players) {
      const choice = player.choice;

      if (choice && !isNaN(Number(choice))) {
        const numericChoice = Number(choice);

        room.minChoice =
          room.minChoice === null
            ? numericChoice
            : Math.min(room.minChoice, numericChoice);

        room.maxChoice =
          room.maxChoice === null
            ? numericChoice
            : Math.max(room.maxChoice, numericChoice);

        sum += numericChoice;
        count++;
      }
    }

    if (count > 0) {
      room.averageChoice = Math.ceil(sum / count);
    }

    this.logger.verbose(
      `Function calculateRoomStats - roomId: ${room.id}, (${sum} / ${count}) minChoice: ${room.minChoice}, maxChoice: ${room.maxChoice}, averageChoice: ${room.averageChoice}`,
    );
  }
}
