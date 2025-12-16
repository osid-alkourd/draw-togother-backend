import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Whiteboard } from './entities/whiteboard.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { WhiteboardCollaboratorsService } from '../whiteboard-collaborators/whiteboard-collaborators.service';
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
}

