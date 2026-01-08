import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for HTTP endpoints
  app.enableCors();
  
  // Use Socket.IO adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  await app.listen(3002); // Running on port 3002 to avoid conflict with main backend (3000) and payment service (3001)
  console.log('🚀 WebSocket Gateway is running on: http://localhost:3002');
}
bootstrap();
