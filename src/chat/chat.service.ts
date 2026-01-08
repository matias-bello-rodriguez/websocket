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
    // This is a complex query to get last message per conversation
    // Using raw query builder might be easier for "group by" logic
    const qb = this.mensajeRepository.createQueryBuilder('m');
    
    // This is a simplified version. In a real app, you'd want the latest message for each pair.
    // For now, let's just return all messages involving the user, client can filter or we improve this later.
    // Or better, let's try to fetch distinct users interacted with.
    
    const sent = await this.mensajeRepository
      .createQueryBuilder('m')
      .select('DISTINCT m.destinatarioId', 'userId')
      .where('m.remitenteId = :userId', { userId })
      .getRawMany();

    const received = await this.mensajeRepository
      .createQueryBuilder('m')
      .select('DISTINCT m.remitenteId', 'userId')
      .where('m.destinatarioId = :userId', { userId })
      .getRawMany();

    const contactIds = new Set([...sent.map(s => s.userId), ...received.map(r => r.userId)]);
    
    // Ideally we would fetch user details here, but we don't have User entity access easily.
    // We return the IDs and let the frontend fetch user details from the main backend.
    return Array.from(contactIds).map(id => ({ userId: id }));
  }
}
