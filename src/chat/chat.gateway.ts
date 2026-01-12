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
      socket.disconnect();
      return;
    }

    try {
      const decoded = this.jwtService.verify(token);
      socket.userId = decoded.userId || decoded.sub;

      if (!socket.userId) {
        this.logger.warn(`Connection rejected: No userId in token for socket ${socket.id}`);
        socket.disconnect();
        return;
      }

      this.userSockets.set(socket.userId, socket.id);
      socket.join(`user:${socket.userId}`);
      
      this.logger.log(`User connected: ${socket.userId} (Socket: ${socket.id})`);
      
      // Notify others that user is online (optional)
      // this.server.emit('user_status', { userId: socket.userId, status: 'online' });
    } catch (error) {
      this.logger.error(`Authentication error for socket ${socket.id}: ${error.message}`);
      socket.disconnect();
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
