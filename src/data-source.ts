import 'dotenv/config';
import { DataSource } from 'typeorm';
import { typeOrmConfig } from './config/typeorm.config';

export const dataSource = new DataSource({
  ...typeOrmConfig(),
  migrations: ['src/database/migrations/*.ts'],
});

export default dataSource;

