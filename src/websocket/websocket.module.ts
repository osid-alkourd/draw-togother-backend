import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WhiteboardGateway } from './whiteboard.gateway';
import { WsJwtAuthGuard } from './guards/ws-jwt-auth.guard';
import { UsersModule } from '../users/users.module';
import { WhiteboardsModule } from '../whiteboards/whiteboards.module';

/**
 * WebSocket Module
 * Provides real-time collaboration features for whiteboards
 * 
 * Dependencies:
 * - UsersModule: For user authentication and validation
 * - WhiteboardsModule: For whiteboard access control
 * - JwtModule: For JWT token validation in WebSocket connections
 */
@Module({
  imports: [
    UsersModule,
    WhiteboardsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [WhiteboardGateway, WsJwtAuthGuard],
  exports: [WhiteboardGateway],
})
export class WebSocketModule {}

