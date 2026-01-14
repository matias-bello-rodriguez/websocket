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
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { Logger } from '@nestjs/common';

interface UserSocket extends Socket {
  userId?: string;
  refreshAttempts?: number;
  lastRefreshAttempt?: number;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private userSockets: Map<string, string> = new Map(); // userId -> socketId
  private readonly MAX_REFRESH_ATTEMPTS = 3;
  private readonly REFRESH_COOLDOWN_MS = 5000; // 5 segundos entre intentos

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(socket: UserSocket) {
    const token =
      socket.handshake.auth.token ||
      (socket.handshake.headers.authorization as string)?.split(' ')[1];

    if (!token) {
      this.logger.warn(`Connection rejected: No token provided for socket ${socket.id}`);
      socket.emit('auth_error', { 
        code: 'NO_TOKEN',
        message: 'No se proporcionó token de autenticación' 
      });
      socket.disconnect();
      return;
    }

    try {
      const decoded = this.jwtService.verify(token);
      socket.userId = decoded.userId || decoded.sub;

      if (!socket.userId) {
        this.logger.warn(`Connection rejected: No userId in token for socket ${socket.id}`);
        socket.emit('auth_error', { 
          code: 'INVALID_TOKEN',
          message: 'Token no contiene userId válido' 
        });
        socket.disconnect();
        return;
      }

      this.userSockets.set(socket.userId, socket.id);
      socket.join(`user:${socket.userId}`);
      
      this.logger.log(`✅ User connected: ${socket.userId} (Socket: ${socket.id})`);
      
      // Emit successful authentication
      socket.emit('authenticated', { userId: socket.userId });
      
      // Notify others that user is online (optional)
      // this.server.emit('user_status', { userId: socket.userId, status: 'online' });
    } catch (error) {
      // Clasificar el tipo de error
      let errorCode = 'AUTH_ERROR';
      let errorMessage = error.message;
      
      if (error.name === 'TokenExpiredError') {
        errorCode = 'TOKEN_EXPIRED';
        errorMessage = 'Token JWT ha expirado';
        this.logger.warn(`⏰ Token expired for socket ${socket.id}`);
      } else if (error.name === 'JsonWebTokenError') {
        errorCode = 'INVALID_TOKEN';
        errorMessage = 'Token JWT inválido';
        this.logger.error(`❌ Invalid JWT for socket ${socket.id}: ${error.message}`);
      } else {
        this.logger.error(`❌ Authentication error for socket ${socket.id}: ${error.message}`);
      }
      
      // Notificar al cliente antes de desconectar
      socket.emit('auth_error', { 
        code: errorCode,
        message: errorMessage 
      });
      
      // Dar tiempo al cliente para recibir el mensaje
      setTimeout(() => socket.disconnect(), 500);
    }
  }

  handleDisconnect(socket: UserSocket) {
    if (socket.userId) {
      this.userSockets.delete(socket.userId);
      this.logger.log(`User disconnected: ${socket.userId}`);
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() socket: UserSocket,
    @MessageBody() data: { receiverId: string; message: string; vehicleId?: string; tempId?: string },
  ) {
    if (!socket.userId) return;

    // Save to DB
    const savedMessage = await this.chatService.saveMessage({
      senderId: socket.userId,
      receiverId: data.receiverId,
      message: data.message,
      vehicleId: data.vehicleId,
    });

    // Emit to receiver
    this.server.to(`user:${data.receiverId}`).emit('receive_message', {
      ...savedMessage,
      tempId: data.tempId, // Echo back tempId for frontend optimistic updates
    });

    // Emit back to sender (confirmation)
    socket.emit('message_sent', {
      ...savedMessage,
      tempId: data.tempId,
    });
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() socket: UserSocket,
    @MessageBody() data: { receiverId: string; isTyping: boolean },
  ) {
    if (!socket.userId) return;
    this.server.to(`user:${data.receiverId}`).emit('user_typing', {
      userId: socket.userId,
      isTyping: data.isTyping,
    });
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() socket: UserSocket,
    @MessageBody() data: { senderId: string },
  ) {
    if (!socket.userId) return;
    await this.chatService.markAsRead(data.senderId, socket.userId);
  }

  @SubscribeMessage('load_conversation')
  async handleLoadConversation(
    @ConnectedSocket() socket: UserSocket,
    @MessageBody() data: { otherUserId: string; limit?: number },
  ) {
    if (!socket.userId) return;
    const messages = await this.chatService.getConversation(socket.userId, data.otherUserId, data.limit);
    socket.emit('conversation_loaded', messages);
  }

  @SubscribeMessage('load_conversations')
  async handleLoadConversations(@ConnectedSocket() socket: UserSocket) {
    if (!socket.userId) return;
    const conversations = await this.chatService.getConversations(socket.userId);
    socket.emit('conversations_loaded', conversations);
  }

  @SubscribeMessage('refresh_auth')
  async handleRefreshAuth(
    @ConnectedSocket() socket: UserSocket,
    @MessageBody() data: { token: string },
  ) {
    // Inicializar contadores si no existen
    if (!socket.refreshAttempts) {
      socket.refreshAttempts = 0;
    }

    // Verificar rate limiting
    const now = Date.now();
    if (socket.lastRefreshAttempt && (now - socket.lastRefreshAttempt) < this.REFRESH_COOLDOWN_MS) {
      this.logger.warn(`⚠️ Refresh rate limit exceeded for socket ${socket.id}`);
      return; // Ignorar silenciosamente
    }

    socket.lastRefreshAttempt = now;
    socket.refreshAttempts++;

    // Si excede intentos máximos, desconectar
    if (socket.refreshAttempts > this.MAX_REFRESH_ATTEMPTS) {
      this.logger.error(`❌ Max refresh attempts exceeded for socket ${socket.id}. Disconnecting.`);
      socket.emit('auth_error', { 
        code: 'MAX_ATTEMPTS_EXCEEDED',
        message: 'Demasiados intentos de autenticación. Por favor, inicia sesión nuevamente.' 
      });
      setTimeout(() => socket.disconnect(), 500);
      return;
    }

    if (!data.token) {
      socket.emit('auth_error', { 
        code: 'NO_TOKEN',
        message: 'No se proporcionó token' 
      });
      return;
    }

    try {
      const decoded = this.jwtService.verify(data.token);
      const newUserId = decoded.userId || decoded.sub;

      if (!newUserId) {
        socket.emit('auth_error', { 
          code: 'INVALID_TOKEN',
          message: 'Token no contiene userId válido' 
        });
        return;
      }

      // Limpiar asociación anterior si existía
      if (socket.userId && socket.userId !== newUserId) {
        this.userSockets.delete(socket.userId);
        socket.leave(`user:${socket.userId}`);
      }

      // Actualizar con nuevo userId
      socket.userId = newUserId;
      this.userSockets.set(newUserId, socket.id);
      socket.join(`user:${newUserId}`);
      
      // Reset counters on successful refresh
      socket.refreshAttempts = 0;
      
      this.logger.log(`🔄 Token refreshed for user: ${newUserId} (Socket: ${socket.id})`);
      
      socket.emit('authenticated', { userId: newUserId });
    } catch (error) {
      let errorCode = 'AUTH_ERROR';
      let errorMessage = error.message;
      
      if (error.name === 'TokenExpiredError') {
        errorCode = 'TOKEN_EXPIRED';
        errorMessage = 'El token ha expirado. Por favor, inicia sesión nuevamente.';
        this.logger.warn(`⏰ Token expired during refresh for socket ${socket.id} (attempt ${socket.refreshAttempts}/${this.MAX_REFRESH_ATTEMPTS})`);
      } else if (error.name === 'JsonWebTokenError') {
        errorCode = 'INVALID_TOKEN';
        errorMessage = 'Token inválido';
        this.logger.error(`❌ Invalid token during refresh for socket ${socket.id}`);
      } else {
        this.logger.error(`❌ Token refresh failed for socket ${socket.id}: ${error.message}`);
      }
      
      socket.emit('auth_error', { 
        code: errorCode,
        message: errorMessage,
        attemptsRemaining: this.MAX_REFRESH_ATTEMPTS - socket.refreshAttempts
      });

      // Si es el último intento, desconectar
      if (socket.refreshAttempts >= this.MAX_REFRESH_ATTEMPTS) {
        this.logger.error(`❌ Final refresh attempt failed for socket ${socket.id}. Disconnecting.`);
        setTimeout(() => socket.disconnect(), 500);
      }
    }
  }

  // Method to be called from Controller
  notifyInspection(userId: string, inspectionId: string, vehicleId: string, message: string) {
    this.server.to(`user:${userId}`).emit('inspection_assigned', {
      inspectionId,
      vehicleId,
      message,
    });
    this.logger.log(`Notification sent to user ${userId} for inspection ${inspectionId}`);
  }

  notifyUsers(userIds: string[], title: string, message: string, data?: any) {
    userIds.forEach(userId => {
      this.server.to(`user:${userId}`).emit('notification', {
        title,
        message,
        ...data,
      });
    });
    this.logger.log(`Notification sent to ${userIds.length} users: ${title}`);
  }
}
