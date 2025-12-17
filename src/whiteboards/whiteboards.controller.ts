import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpStatus,
  ValidationPipe,
  UseGuards,
  NotFoundException,
  ForbiddenException,
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

  /**
   * Get a specific whiteboard by ID with snapshots
   * Requires authentication and access permission
   * Access rules:
   * - Owner can always access
   * - Collaborators can access if they were invited
   * - Private whiteboards (no collaborators) can only be accessed by owner
   * @param id - Whiteboard ID
   * @param user - Current authenticated user (from JWT token)
   * @returns Whiteboard with snapshots and shapes data
   */
  @Get(':id')
  async getWhiteboardById(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      const whiteboard = await this.whiteboardsService.findByIdWithAccess(
        id,
        user,
      );

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Whiteboard retrieved successfully',
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
          snapshots: whiteboard.snapshots?.map((snapshot) => ({
            id: snapshot.id,
            data: snapshot.data, // Contains shapes and drawings
            createdAt: snapshot.createdAt,
            updatedAt: snapshot.updatedAt,
          })) || [],
          createdAt: whiteboard.createdAt,
          updatedAt: whiteboard.updatedAt,
        },
      };
    } catch (error) {
      // Handle different error types
      if (error instanceof NotFoundException) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: error.message || 'Whiteboard not found',
          data: null,
        };
      }

      if (error instanceof ForbiddenException) {
        return {
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: error.message || 'You do not have permission to access this whiteboard',
          data: null,
        };
      }

      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to retrieve whiteboard',
        error: error.message,
        data: null,
      };
    }
  }
}

