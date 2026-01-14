import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Mensaje } from '../entities/Mensaje.entity';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(Mensaje)
    private mensajeRepository: Repository<Mensaje>,
  ) {}

  async saveMessage(data: {
    senderId: string;
    receiverId: string;
    message: string;
    vehicleId?: string;
  }): Promise<Mensaje> {
    const mensaje = this.mensajeRepository.create({
      remitenteId: data.senderId,
      destinatarioId: data.receiverId,
      contenido: data.message,
      vehiculoId: data.vehicleId,
    });
    return await this.mensajeRepository.save(mensaje);
  }

  async getConversation(userId: string, otherUserId: string, limit: number = 50): Promise<Mensaje[]> {
    return await this.mensajeRepository.find({
      where: [
        { remitenteId: userId, destinatarioId: otherUserId },
        { remitenteId: otherUserId, destinatarioId: userId },
      ],
      order: { fechaCreacion: 'ASC' },
      take: limit,
    });
  }

  async markAsRead(senderId: string, receiverId: string): Promise<void> {
    await this.mensajeRepository.update(
      { remitenteId: senderId, destinatarioId: receiverId, leido: false },
      { leido: true },
    );
  }

  async getConversations(userId: string): Promise<any[]> {
    const messages = await this.mensajeRepository.find({
      where: [
        { remitenteId: userId },
        { destinatarioId: userId },
      ],
      order: { fechaCreacion: 'DESC' },
    });

    const conversationsMap = new Map<string, any>();

    messages.forEach((msg) => {
      const otherUserId = msg.remitenteId === userId ? msg.destinatarioId : msg.remitenteId;
      
      if (!conversationsMap.has(otherUserId)) {
        conversationsMap.set(otherUserId, {
          userId: otherUserId,
          unreadCount: 0,
          lastMessageDate: msg.fechaCreacion,
        });
      }

      const conv = conversationsMap.get(otherUserId);
      if (msg.destinatarioId === userId && !msg.leido) {
        conv.unreadCount += 1;
      }
    });

    return Array.from(conversationsMap.values());
  }
}
