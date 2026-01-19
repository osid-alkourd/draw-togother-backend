import { IsNotEmpty, IsUUID } from 'class-validator';

/**
 * DTO for join_whiteboard event
 * Validates the whiteboardId when a user joins a whiteboard room
 */
export class JoinWhiteboardDto {
  @IsNotEmpty({ message: 'Whiteboard ID is required' })
  @IsUUID('4', { message: 'Whiteboard ID must be a valid UUID' })
  whiteboardId: string;
}

