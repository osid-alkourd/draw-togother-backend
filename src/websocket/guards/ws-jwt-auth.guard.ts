import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { UsersService } from '../../users/users.service';

/**
 * WebSocket JWT Authentication Guard
 * Validates JWT tokens from Socket.IO handshake for authenticated connections
 * Extracts token from handshake cookies or auth headers
 */
@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Validates the WebSocket connection by checking JWT token
   * @param context - Execution context containing the WebSocket client
   * @returns true if authenticated, throws UnauthorizedException otherwise
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    
    try {
      // Extract token from handshake cookies or auth header
      const token = this.extractTokenFromHandshake(client);
      
      if (!token) {
        this.logger.warn('WebSocket connection attempt without token');
        client.disconnect();
        throw new UnauthorizedException('No authentication token provided');
      }

      // Verify and decode JWT token
      const payload: JwtPayload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'your-secret-key',
      });

      // Fetch user from database to ensure user still exists
      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        this.logger.warn(`User not found for token payload: ${payload.sub}`);
        client.disconnect();
        throw new UnauthorizedException('User not found');
      }

      // Attach user to socket data for use in gateway handlers
      client.data.user = user;
      client.data.userId = user.id;

      this.logger.debug(`WebSocket authentication successful for user: ${user.email}`);
      return true;
    } catch (error) {
      // If it's already an UnauthorizedException, re-throw it
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      // Log the error and disconnect
      this.logger.error(`WebSocket authentication failed: ${error.message}`);
      client.disconnect();
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Extracts JWT token from Socket.IO handshake
   * Checks cookies first (for HttpOnly cookies), then Authorization header
   * @param client - Socket.IO client
   * @returns JWT token string or null
   */
  private extractTokenFromHandshake(client: Socket): string | null {
    // Priority 1: Try to get token from auth object (most reliable for Socket.IO)
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token;
    }

    // Priority 2: Try to get token from query parameters
    const queryToken = client.handshake.query?.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }

    // Priority 3: Try to get token from cookies
    const cookies = client.handshake.headers.cookie;
    if (cookies) {
      const tokenMatch = cookies.match(/token=([^;]+)/);
      if (tokenMatch) {
        return tokenMatch[1];
      }
    }

    // Priority 4: Try to get token from Authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }
}

