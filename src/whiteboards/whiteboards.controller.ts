import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpStatus,
  HttpCode,
  ValidationPipe,
  ParseUUIDPipe,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { WhiteboardsService } from './whiteboards.service';
import { CreateWhiteboardDto } from './dto/create-whiteboard.dto';
import { AddCollaboratorDto } from './dto/add-collaborator.dto';
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
   * Add a collaborator to a whiteboard (owner only)
   * Requires authentication and ownership
   * @param id - Whiteboard ID
   * @param addCollaboratorDto - Email of the user to add as collaborator
   * @param user - Current authenticated user (must be the owner)
   * @param res - Express response object for setting status codes
   * @returns Added collaborator information
   */
  @Post(':id/collaborators')
  @HttpCode(HttpStatus.CREATED)
  async addCollaborator(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) addCollaboratorDto: AddCollaboratorDto,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const collaborator = await this.whiteboardsService.addCollaborator(
        id,
        addCollaboratorDto.email,
        user,
      );

      return {
        success: true,
        statusCode: HttpStatus.CREATED,
        message: 'Collaborator added successfully',
        data: {
          userId: collaborator.userId,
          user: {
            id: collaborator.user.id,
            email: collaborator.user.email,
            fullName: collaborator.user.fullName,
          },
          role: collaborator.role,
          createdAt: collaborator.createdAt,
        },
      };
    } catch (error) {
      // Handle different error types
      if (error instanceof NotFoundException) {
        res.status(HttpStatus.NOT_FOUND);
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: error.message || 'Whiteboard not found',
          data: null,
        };
      }

      if (error instanceof ForbiddenException) {
        res.status(HttpStatus.FORBIDDEN);
        return {
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: error.message || 'You do not have permission to add collaborators to this whiteboard',
          data: null,
        };
      }

      if (error instanceof BadRequestException) {
        res.status(HttpStatus.BAD_REQUEST);
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message || 'Invalid request',
          data: null,
        };
      }

      if (error instanceof ConflictException) {
        res.status(HttpStatus.CONFLICT);
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: error.message || 'This user is already a collaborator on this whiteboard',
          data: null,
        };
      }

      res.status(HttpStatus.INTERNAL_SERVER_ERROR);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to add collaborator',
        error: error.message,
        data: null,
      };
    }
  }

  /**
   * Delete a whiteboard (owner only)
   * This will automatically delete all snapshots and collaborators due to CASCADE constraints
   * Requires authentication and ownership
   * @param id - Whiteboard ID
   * @param user - Current authenticated user (must be the owner)
   * @param res - Express response object for setting status codes
   * @returns Success message
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteWhiteboard(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      await this.whiteboardsService.delete(id, user);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Whiteboard deleted successfully',
        data: null,
      };
    } catch (error) {
      // Handle different error types
      if (error instanceof NotFoundException) {
        res.status(HttpStatus.NOT_FOUND);
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: error.message || 'Whiteboard not found',
          data: null,
        };
      }

      if (error instanceof ForbiddenException) {
        res.status(HttpStatus.FORBIDDEN);
        return {
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: error.message || 'You do not have permission to delete this whiteboard',
          data: null,
        };
      }

      res.status(HttpStatus.INTERNAL_SERVER_ERROR);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to delete whiteboard',
        error: error.message,
        data: null,
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

