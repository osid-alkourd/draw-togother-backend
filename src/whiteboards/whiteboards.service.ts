import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Whiteboard } from './entities/whiteboard.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { WhiteboardCollaboratorsService } from '../whiteboard-collaborators/whiteboard-collaborators.service';
import { WhiteboardCollaborator } from '../whiteboard-collaborators/entities/whiteboard-collaborator.entity';
import { CreateWhiteboardDto, BoardAccessType } from './dto/create-whiteboard.dto';

@Injectable()
export class WhiteboardsService {
  constructor(
    @InjectRepository(Whiteboard)
    private readonly whiteboardRepository: Repository<Whiteboard>,
    private readonly usersService: UsersService,
    private readonly collaboratorsService: WhiteboardCollaboratorsService,
  ) {}

  /**
   * Create a new whiteboard
   * @param createWhiteboardDto - Whiteboard creation data
   * @param owner - User creating the whiteboard
   * @returns Created whiteboard entity with collaborators
   */
  async create(
    createWhiteboardDto: CreateWhiteboardDto,
    owner: User,
  ): Promise<Whiteboard> {
    // Create whiteboard entity
    const whiteboard = this.whiteboardRepository.create({
      title: createWhiteboardDto.title.trim(),
      description: createWhiteboardDto.description?.trim() || undefined,
      owner,
      isPublic: false, // Always private by default
    });

    const savedWhiteboard = await this.whiteboardRepository.save(whiteboard);

    // Handle collaborators if access type is invite_specific_users
    if (
      createWhiteboardDto.boardAccess === BoardAccessType.INVITE_SPECIFIC_USERS
    ) {
      if (!createWhiteboardDto.invitedEmails || createWhiteboardDto.invitedEmails.length === 0) {
        throw new BadRequestException(
          'Invited emails are required when access type is invite_specific_users',
        );
      }

      // Validate that all invited users exist
      const invitedUsers: User[] = [];
      const invalidEmails: string[] = [];

      for (const email of createWhiteboardDto.invitedEmails) {
        const normalizedEmail = email.toLowerCase().trim();
        
        // Don't add the owner as a collaborator
        if (normalizedEmail === owner.email.toLowerCase()) {
          continue;
        }

        const user = await this.usersService.findByEmail(normalizedEmail);
        if (user) {
          invitedUsers.push(user);
        } else {
          invalidEmails.push(email);
        }
      }

      if (invalidEmails.length > 0) {
        throw new BadRequestException(
          `The following users do not exist in the system: ${invalidEmails.join(', ')}`,
        );
      }

      // Add collaborators
      if (invitedUsers.length > 0) {
        await this.collaboratorsService.addCollaborators(
          savedWhiteboard,
          invitedUsers,
          'editor', // Default role - all users can update the whiteboard
        );
      }
    }

    // Load whiteboard with relations
    const whiteboardWithRelations = await this.whiteboardRepository.findOne({
      where: { id: savedWhiteboard.id },
      relations: ['owner', 'collaborators', 'collaborators.user'],
    });

    if (!whiteboardWithRelations) {
      throw new BadRequestException('Failed to load created whiteboard');
    }

    return whiteboardWithRelations;
  }

  /**
   * Find whiteboard by ID
   * @param id - Whiteboard ID
   * @returns Whiteboard entity or null
   */
  async findById(id: string): Promise<Whiteboard | null> {
    return await this.whiteboardRepository.findOne({
      where: { id },
      relations: ['owner', 'collaborators', 'collaborators.user'],
    });
  }

  /**
   * Find all whiteboards owned by a specific user
   * @param ownerId - Owner user ID
   * @returns Array of whiteboard entities
   */
  async findByOwner(ownerId: string): Promise<Whiteboard[]> {
    return await this.whiteboardRepository.find({
      where: { owner: { id: ownerId } },
      relations: ['owner', 'collaborators', 'collaborators.user'],
      order: { createdAt: 'DESC' }, // Most recent first
    });
  }

  /**
   * Check if user has access to a whiteboard
   * Access rules:
   * - Owner can always access
   * - Collaborators can access if they were invited
   * - Private whiteboards (no collaborators) can only be accessed by owner
   * @param whiteboard - Whiteboard entity
   * @param user - User to check access for
   * @returns true if user has access, false otherwise
   */
  async hasAccess(whiteboard: Whiteboard, user: User): Promise<boolean> {
    // Owner always has access
    if (whiteboard.owner.id === user.id) {
      return true;
    }

    // Check if user is a collaborator (invited user)
    const collaborator =
      await this.collaboratorsService.findCollaboratorByUserAndWhiteboard(
        whiteboard.id,
        user.id,
      );

    // If user is a collaborator, they have access
    return collaborator !== null;
  }

  /**
   * Get whiteboard by ID with snapshots and access control
   * @param whiteboardId - Whiteboard ID
   * @param user - Current user requesting access
   * @returns Whiteboard entity with snapshots
   * @throws NotFoundException if whiteboard not found
   * @throws ForbiddenException if user doesn't have access
   */
  async findByIdWithAccess(
    whiteboardId: string,
    user: User,
  ): Promise<Whiteboard> {
    // Find whiteboard with all relations
    const whiteboard = await this.whiteboardRepository.findOne({
      where: { id: whiteboardId },
      relations: [
        'owner',
        'collaborators',
        'collaborators.user',
        'snapshots',
      ],
      order: {
        snapshots: {
          createdAt: 'ASC', // Oldest snapshots first
        },
      },
    });

    if (!whiteboard) {
      throw new NotFoundException('Whiteboard not found');
    }

    // Check access
    const hasAccess = await this.hasAccess(whiteboard, user);
    if (!hasAccess) {
      throw new ForbiddenException(
        'You do not have permission to access this whiteboard',
      );
    }

    return whiteboard;
  }

  /**
   * Add a collaborator to a whiteboard (owner only)
   * @param whiteboardId - Whiteboard ID
   * @param userEmail - Email of the user to add as collaborator
   * @param owner - Current user (must be the owner)
   * @returns Created collaborator entity with user relation
   * @throws NotFoundException if whiteboard not found
   * @throws ForbiddenException if user is not the owner
   * @throws BadRequestException if user doesn't exist in the system
   * @throws ConflictException if user is already a collaborator
   */
  async addCollaborator(
    whiteboardId: string,
    userEmail: string,
    owner: User,
  ): Promise<WhiteboardCollaborator> {
    // Find whiteboard with owner relation
    const whiteboard = await this.whiteboardRepository.findOne({
      where: { id: whiteboardId },
      relations: ['owner'],
    });

    if (!whiteboard) {
      throw new NotFoundException('Whiteboard not found');
    }

    // Verify that the current user is the owner
    if (whiteboard.owner.id !== owner.id) {
      throw new ForbiddenException(
        'Only the owner can add collaborators to this whiteboard',
      );
    }

    // Normalize email
    const normalizedEmail = userEmail.toLowerCase().trim();

    // Don't allow adding the owner as a collaborator
    if (normalizedEmail === owner.email.toLowerCase()) {
      throw new BadRequestException(
        'You cannot add yourself as a collaborator',
      );
    }

    // Find the user by email
    const userToAdd = await this.usersService.findByEmail(normalizedEmail);

    if (!userToAdd) {
      throw new BadRequestException(
        'User with this email does not exist in the system',
      );
    }

    // Add collaborator (this will throw ConflictException if already exists)
    const collaborator = await this.collaboratorsService.addCollaborator(
      whiteboard,
      userToAdd,
      'editor',
    );

    // Load collaborator with user relation
    const collaboratorWithUser = await this.collaboratorsService.findCollaboratorByUserAndWhiteboard(
      whiteboardId,
      userToAdd.id,
    );

    if (!collaboratorWithUser) {
      throw new BadRequestException('Failed to load created collaborator');
    }

    return collaboratorWithUser;
  }

  /**
   * Delete a whiteboard (owner only)
   * This will cascade delete all snapshots and collaborators due to CASCADE constraints
   * @param whiteboardId - Whiteboard ID
   * @param owner - Current user (must be the owner)
   * @throws NotFoundException if whiteboard not found
   * @throws ForbiddenException if user is not the owner
   */
  async delete(whiteboardId: string, owner: User): Promise<void> {
    // Find whiteboard with owner relation
    const whiteboard = await this.whiteboardRepository.findOne({
      where: { id: whiteboardId },
      relations: ['owner'],
    });

    if (!whiteboard) {
      throw new NotFoundException('Whiteboard not found');
    }

    // Verify that the current user is the owner
    if (whiteboard.owner.id !== owner.id) {
      throw new ForbiddenException(
        'Only the owner can delete this whiteboard',
      );
    }

    // Delete whiteboard (CASCADE will automatically delete snapshots and collaborators)
    await this.whiteboardRepository.remove(whiteboard);
  }
}

