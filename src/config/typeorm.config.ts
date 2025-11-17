import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { User } from '../users/entities/user.entity';

const parsePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const typeOrmConfig = (): TypeOrmModuleOptions & DataSourceOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parsePort(process.env.DB_PORT, 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'whiteboard',
  entities: [User],
  migrations: ['dist/database/migrations/*.js'],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
});

