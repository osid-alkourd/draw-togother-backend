import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { typeOrmConfig } from './config/typeorm.config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WhiteboardsModule } from './whiteboards/whiteboards.module';
import { WhiteboardSnapshotsModule } from './whiteboard-snapshots/whiteboard-snapshots.module';
import { WebSocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(typeOrmConfig()),
    AuthModule,
    UsersModule,
    WhiteboardsModule,
    WhiteboardSnapshotsModule,
    WebSocketModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
