import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module';
import { Mensaje } from './entities/Mensaje.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 3306,
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'autobox_db',
      entities: [Mensaje],
      synchronize: true, // Auto-create 'mensaje' table since it's not in sql.sql yet
    }),
    ChatModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
