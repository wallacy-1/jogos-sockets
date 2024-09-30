import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { PokerService } from './poker.service';

@Controller('scrumPoker')
export class PokerController {
  constructor(private readonly pokerService: PokerService) {}

  @Post('create')
  createRoom() {
    const roomId = this.pokerService.createRoom();
    return { message: 'Room created', roomId };
  }

  @Get(':roomId')
  roomExists(@Param('roomId') roomId: string) {
    const room = this.pokerService.roomExists(roomId);

    if (!room) throw new NotFoundException('Room not found.');

    return { message: 'Room exists', roomId };
  }

  @Get(':roomId/player/:playerName')
  checkPlayerInRoom(
    @Param('roomId') roomId: string,
    @Param('playerName') playerName: string,
  ) {
    const room = this.pokerService.getRoom(roomId);

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const playerExists = this.pokerService.isPlayerNameTaken(room, playerName);

    if (playerExists) {
      throw new BadRequestException(
        'Name already taken, please choose another.',
      );
    }

    return {
      message: `Name ${playerName} is available`,
      available: true,
    };
  }
}
