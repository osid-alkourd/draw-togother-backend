import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UsePipes, ValidationPipe, UseGuards, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsJwtAuthGuard } from './guards/ws-jwt-auth.guard';
import { JoinWhiteboardDto } from './dto/join-whiteboard.dto';
import { DrawUpdateDto } from './dto/draw-update.dto';
import { WhiteboardsService } from '../whiteboards/whiteboards.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * WebSocket Gateway for Real-Time Whiteboard Collaboration
 * Handles real-time drawing updates and user presence
 * 
 * Architecture:
 * - Each whiteboard is a Socket.IO room identified by whiteboardId
 * - Users join rooms when they open a whiteboard
 * - Drawing updates are broadcast to all users in the room (except sender)
 * - Real-time logic is separate from database persistence
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/whiteboard',
})
@UseGuards(WsJwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class WhiteboardGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WhiteboardGateway.name);

  // Map to track which rooms each user is in
  private userRooms = new Map<string, Set<string>>();

  constructor(
    private readonly whiteboardsService: WhiteboardsService,
    @Inject(forwardRef(() => JwtService))
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  /**
   * Handles new WebSocket connections
   * Manually authenticates user if guard didn't set it (guards may not run for lifecycle hooks)
   * @param client - Connected Socket.IO client
   */
  async handleConnection(@ConnectedSocket() client: Socket) {
    try {
      let user: User | null = client.data.user;

      // If user is not set by guard, manually authenticate
      if (!user || !user.id) {
        this.logger.debug('User not set by guard, attempting manual authentication...');
        user = await this.authenticateClient(client);
        
        if (!user) {
          this.logger.warn('Connection attempt without authenticated user, disconnecting...');
          client.disconnect();
          return;
        }
        
        // Set user in client data for future use
        client.data.user = user;
        client.data.userId = user.id;
      }

      this.logger.log(`User connected: ${user.email} (${user.id})`);

      // Initialize user's room set if not exists
      if (!this.userRooms.has(user.id)) {
        this.userRooms.set(user.id, new Set());
      }
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`, error.stack);
      client.disconnect();
    }
  }

  /**
   * Manually authenticates a Socket.IO client
   * Extracts and validates JWT token from handshake
   * @param client - Socket.IO client
   * @returns User entity if authenticated, null otherwise
   */
  private async authenticateClient(client: Socket): Promise<User | null> {
    try {
      // Extract token from handshake
      const token = this.extractTokenFromHandshake(client);
      
      if (!token) {
        this.logger.warn('No token found in handshake');
        this.logger.debug('Handshake details:', {
          hasCookies: !!client.handshake.headers.cookie,
          cookies: client.handshake.headers.cookie ? 'present' : 'missing',
          hasAuth: !!client.handshake.auth,
          authKeys: client.handshake.auth ? Object.keys(client.handshake.auth) : [],
          hasAuthHeader: !!client.handshake.headers.authorization,
        });
        return null;
      }

      this.logger.debug(`Token found, length: ${token.length}`);

      // Verify and decode JWT token
      const payload: JwtPayload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'your-secret-key',
      });

      this.logger.debug(`Token verified, user ID: ${payload.sub}`);

      // Fetch user from database
      const user = await this.usersService.findById(payload.sub);
      
      if (!user) {
        this.logger.warn(`User not found for token payload: ${payload.sub}`);
        return null;
      }

      this.logger.debug(`User authenticated: ${user.email}`);
      return user;
    } catch (error) {
      this.logger.error(`Authentication failed: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Extracts JWT token from Socket.IO handshake
   * Checks cookies, auth object, and Authorization header
   * @param client - Socket.IO client
   * @returns JWT token string or null
   */
  private extractTokenFromHandshake(client: Socket): string | null {
    // Priority 1: Try to get token from auth object (most reliable for Socket.IO)
    if (client.handshake.auth?.token) {
      this.logger.debug('Token found in handshake.auth.token');
      return client.handshake.auth.token;
    } else if (client.handshake.auth) {
      this.logger.debug('handshake.auth exists but no token property', Object.keys(client.handshake.auth));
    }

    // Priority 2: Try to get token from query parameters
    const queryToken = client.handshake.query?.token;
    if (queryToken && typeof queryToken === 'string') {
      this.logger.debug('Token found in query parameters');
      return queryToken;
    }

    // Priority 3: Try to get token from cookies
    const cookies = client.handshake.headers.cookie;
    if (cookies) {
      this.logger.debug('Cookies found in handshake');
      const tokenMatch = cookies.match(/token=([^;]+)/);
      if (tokenMatch) {
        this.logger.debug('Token extracted from cookies');
        return tokenMatch[1];
      } else {
        this.logger.debug('Cookie found but no token= match');
      }
    } else {
      this.logger.debug('No cookies in handshake headers');
    }

    // Priority 4: Try to get token from Authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      this.logger.debug('Token found in Authorization header');
      return authHeader.substring(7);
    }

    this.logger.debug('No token found in any location');
    return null;
  }

  /**
   * Handles WebSocket disconnections
   * Cleans up user from all rooms they were in
   * @param client - Disconnected Socket.IO client
   */
  async handleDisconnect(@ConnectedSocket() client: Socket) {
    const user: User = client.data.user;
    
    // Safety check: if user is not set, just log and return
    if (!user || !user.id) {
      this.logger.warn('Disconnection from unauthenticated client');
      return;
    }

    this.logger.log(`User disconnected: ${user.email} (${user.id})`);

    // Remove user from all rooms and clean up
    const userRoomSet = this.userRooms.get(user.id);
    if (userRoomSet) {
      userRoomSet.forEach((roomId) => {
        client.leave(roomId);
        this.logger.debug(`User ${user.email} left room: ${roomId}`);
      });
      this.userRooms.delete(user.id);
    }
  }

  /**
   * Handles join_whiteboard event
   * Validates user access and adds them to the whiteboard room
   * 
   * @param client - Socket.IO client
   * @param payload - Contains whiteboardId
   */
  @SubscribeMessage('join_whiteboard')
  async handleJoinWhiteboard(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinWhiteboardDto,
  ) {
    const user: User = client.data.user;
    const { whiteboardId } = payload;

    try {
      // Verify user has access to this whiteboard
      // This ensures only authorized users can join the room
      await this.whiteboardsService.findByIdWithAccess(whiteboardId, user);

      // Join the Socket.IO room for this whiteboard
      // Room name format: `whiteboard:${whiteboardId}`
      const roomName = `whiteboard:${whiteboardId}`;
      await client.join(roomName);

      // Track which rooms the user is in
      if (!this.userRooms.has(user.id)) {
        this.userRooms.set(user.id, new Set());
      }
      this.userRooms.get(user.id)!.add(whiteboardId);

      // Get the room to check how many clients are in it (using safe access)
      let roomSize = 0;
      try {
        const adapter = this.server?.sockets?.adapter;
        if (adapter?.rooms) {
          const room = adapter.rooms.get(roomName);
          roomSize = room ? room.size : 0;
        } else {
          // Fallback: use server.in() method
          const socketsInRoom = await this.server.in(roomName).fetchSockets();
          roomSize = socketsInRoom.length;
        }
      } catch (error) {
        this.logger.warn(`Could not get room size for ${roomName}: ${error.message}`);
        // Fallback: assume at least 1 (the current client)
        roomSize = 1;
      }

      this.logger.log(
        `[JOIN] User ${user.email} (${user.id}) joined whiteboard room: ${whiteboardId} (Room now has ${roomSize} client(s))`,
      );

      // Notify the client that they successfully joined
      client.emit('joined_whiteboard', {
        success: true,
        whiteboardId,
        message: 'Successfully joined whiteboard',
      });

      // Optionally notify other users in the room (for presence features)
      client.to(roomName).emit('user_joined', {
        userId: user.id,
        userEmail: user.email,
        whiteboardId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to join whiteboard ${whiteboardId} for user ${user.email}: ${error.message}`,
      );

      // Notify client of the error
      client.emit('join_error', {
        success: false,
        whiteboardId,
        message: error.message || 'Failed to join whiteboard',
      });
    }
  }

  /**
   * Handles draw_update event
   * Broadcasts drawing updates to all users in the same whiteboard room (except sender)
   * 
   * Note: This only handles real-time broadcasting.
   * Database persistence should be handled separately via HTTP endpoints.
   * 
   * @param client - Socket.IO client
   * @param payload - Contains whiteboardId, updateType, and drawing data
   */
  @SubscribeMessage('draw_update')
  async handleDrawUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DrawUpdateDto,
  ) {
    const user: User = client.data.user;
    const { whiteboardId, updateType, data } = payload;

    try {
      // Verify user is in the room (they should have joined via join_whiteboard first)
      const roomName = `whiteboard:${whiteboardId}`;
      const userRoomSet = this.userRooms.get(user.id);

      if (!userRoomSet || !userRoomSet.has(whiteboardId)) {
        this.logger.warn(
          `User ${user.email} not in room ${whiteboardId}, attempting to join...`,
        );
        // User not in room, try to join first
        await this.handleJoinWhiteboard(client, { whiteboardId });
      }

      // Get the room to check how many clients are in it (using safe access)
      let roomSize = 0;
      try {
        const adapter = this.server?.sockets?.adapter;
        if (adapter?.rooms) {
          const room = adapter.rooms.get(roomName);
          roomSize = room ? room.size : 0;
        } else {
          // Fallback: use server.in() method
          const socketsInRoom = await this.server.in(roomName).fetchSockets();
          roomSize = socketsInRoom.length;
        }
      } catch (error) {
        this.logger.warn(`Could not get room size for ${roomName}: ${error.message}`);
        // Fallback: assume at least 1 (the current client)
        roomSize = 1;
      }

      this.logger.log(
        `[DRAW_UPDATE] User ${user.email} (${user.id}) broadcasting ${updateType} to room ${roomName} (${roomSize} clients)`,
      );

      // Broadcast the drawing update to all other users in the room
      // Using 'to()' excludes the sender from receiving their own update
      client.to(roomName).emit('draw_update', {
        whiteboardId,
        updateType,
        data,
        userId: user.id, // Include sender ID for potential UI features (e.g., showing who drew)
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `[DRAW_UPDATE] Successfully broadcasted ${updateType} update from ${user.email} to ${roomSize - 1} other user(s) in room ${whiteboardId}`,
      );
    } catch (error) {
      this.logger.error(
        `[DRAW_UPDATE] Failed to broadcast draw update for whiteboard ${whiteboardId} by user ${user.email}: ${error.message}`,
        error.stack,
      );

      // Notify client of the error
      client.emit('draw_update_error', {
        success: false,
        whiteboardId,
        message: error.message || 'Failed to broadcast drawing update',
      });
    }
  }

  /**
   * Handles leave_whiteboard event (optional)
   * Allows users to explicitly leave a whiteboard room
   * 
   * @param client - Socket.IO client
   * @param payload - Contains whiteboardId
   */
  @SubscribeMessage('leave_whiteboard')
  async handleLeaveWhiteboard(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinWhiteboardDto,
  ) {
    const user: User = client.data.user;
    const { whiteboardId } = payload;

    const roomName = `whiteboard:${whiteboardId}`;
    await client.leave(roomName);

    // Remove from tracking
    const userRoomSet = this.userRooms.get(user.id);
    if (userRoomSet) {
      userRoomSet.delete(whiteboardId);
    }

    this.logger.log(
      `User ${user.email} left whiteboard room: ${whiteboardId}`,
    );

    // Notify other users in the room
    client.to(roomName).emit('user_left', {
      userId: user.id,
      userEmail: user.email,
      whiteboardId,
    });

    client.emit('left_whiteboard', {
      success: true,
      whiteboardId,
      message: 'Successfully left whiteboard',
    });
  }
}

