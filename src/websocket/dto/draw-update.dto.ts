import { IsNotEmpty, IsUUID, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * DTO for draw_update event
 * Contains the drawing data to be broadcast to other users in the room
 * Drawing data structure matches the frontend whiteboard state
 */
export class DrawUpdateDto {
  @IsNotEmpty({ message: 'Whiteboard ID is required' })
  @IsUUID('4', { message: 'Whiteboard ID must be a valid UUID' })
  whiteboardId: string;

  @IsNotEmpty({ message: 'Update type is required' })
  @IsString({ message: 'Update type must be a string' })
  updateType: 'stroke' | 'rectangle' | 'circle' | 'arrow' | 'line' | 'text' | 'clear' | 'delete';

  @IsObject({ message: 'Data must be an object' })
  @IsOptional()
  data?: {
    // For stroke updates
    stroke?: {
      color: string;
      width: number;
      points: Array<{ x: number; y: number }>;
    };
    // For shape updates (rectangle, circle, arrow, line, text)
    shape?: {
      id: string;
      [key: string]: unknown;
    };
    // For delete operations
    shapeId?: string;
    // For clear operations
    clearAll?: boolean;
  };
}

