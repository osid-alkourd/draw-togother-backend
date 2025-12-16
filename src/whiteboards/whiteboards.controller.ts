import {
  Controller,
  Post,
  Get,
  Body,
  HttpStatus,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { WhiteboardsService } from './whiteboards.service';
import { CreateWhiteboardDto } from './dto/create-whiteboard.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';

@Controller('whiteboards')
@UseGuards(JwtAuthGuard)
export class WhiteboardsController {
  constructor(private readonly whiteboardsService: WhiteboardsService) {}

  /**
   * Create a new whiteboard
   * Requires authentication
   * @param createWhiteboardDto - Whiteboard creation data
   * @param user - Current authenticated user (from JWT token)
   * @returns Created whiteboard information
   */
  @Post()
  async create(
    @Body(ValidationPipe) createWhiteboardDto: CreateWhiteboardDto,
    @CurrentUser() user: User,
  ) {
    const whiteboard = await this.whiteboardsService.create(
      createWhiteboardDto,
      user,
    );

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Whiteboard created successfully',
      data: {
        id: whiteboard.id,
        title: whiteboard.title,
        description: whiteboard.description,
        isPublic: whiteboard.isPublic,
        owner: {
          id: whiteboard.owner.id,
          email: whiteboard.owner.email,
          fullName: whiteboard.owner.fullName,
        },
        collaborators: whiteboard.collaborators?.map((collab) => ({
          userId: collab.userId,
          user: {
            id: collab.user.id,
            email: collab.user.email,
            fullName: collab.user.fullName,
          },
          role: collab.role,
        })) || [],
        createdAt: whiteboard.createdAt,
        updatedAt: whiteboard.updatedAt,
      },
    };
  }

  /**
   * Get all whiteboards owned by the current user
   * Requires authentication
   * @param user - Current authenticated user (from JWT token)
   * @returns List of whiteboards owned by the user
   */
  @Get('my-whiteboards')
  async getMyWhiteboards(@CurrentUser() user: User) {
    try {
      const whiteboards = await this.whiteboardsService.findByOwner(user.id);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Whiteboards retrieved successfully',
        data: whiteboards.map((whiteboard) => ({
          id: whiteboard.id,
          name: whiteboard.title,
          updated_at: whiteboard.updatedAt,
        })),
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to retrieve whiteboards',
        data: [],
      };
    }
  }
}

