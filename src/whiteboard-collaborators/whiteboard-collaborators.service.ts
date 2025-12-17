import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhiteboardCollaborator } from './entities/whiteboard-collaborator.entity';
import { Whiteboard } from '../whiteboards/entities/whiteboard.entity';
import { User } from '../users/entities/user.entity';
import { CollaboratorRole } from './entities/whiteboard-collaborator.entity';

@Injectable()
export class WhiteboardCollaboratorsService {
  constructor(
    @InjectRepository(WhiteboardCollaborator)
    private readonly collaboratorRepository: Repository<WhiteboardCollaborator>,
  ) {}

  /**
   * Add collaborators to a whiteboard
   * @param whiteboard - Whiteboard entity
   * @param users - Array of users to add as collaborators
   * @param role - Role for the collaborators (default: 'editor')
   * @returns Array of created collaborator entities
   */
  async addCollaborators(
    whiteboard: Whiteboard,
    users: User[],
    role: CollaboratorRole = 'editor',
  ): Promise<WhiteboardCollaborator[]> {
    const collaborators: WhiteboardCollaborator[] = [];

    for (const user of users) {
      // Check if collaboration already exists
      const existing = await this.collaboratorRepository.findOne({
        where: {
          whiteboardId: whiteboard.id,
          userId: user.id,
        },
      });

      if (!existing) {
        const collaborator = this.collaboratorRepository.create({
          whiteboardId: whiteboard.id,
          userId: user.id,
          whiteboard,
          user,
          role,
        });

        collaborators.push(await this.collaboratorRepository.save(collaborator));
      }
    }

    return collaborators;
  }

  /**
   * Find collaborators by whiteboard ID
   * @param whiteboardId - Whiteboard ID
   * @returns Array of collaborator entities
   */
  async findByWhiteboardId(
    whiteboardId: string,
  ): Promise<WhiteboardCollaborator[]> {
    return await this.collaboratorRepository.find({
      where: { whiteboardId },
      relations: ['user'],
    });
  }

  /**
   * Check if user is a collaborator on a whiteboard
   * @param whiteboardId - Whiteboard ID
   * @param userId - User ID
   * @returns Collaborator entity if user is a collaborator, null otherwise
   */
  async findCollaboratorByUserAndWhiteboard(
    whiteboardId: string,
    userId: string,
  ): Promise<WhiteboardCollaborator | null> {
    return await this.collaboratorRepository.findOne({
      where: {
        whiteboardId,
        userId,
      },
      relations: ['user'],
    });
  }
}

