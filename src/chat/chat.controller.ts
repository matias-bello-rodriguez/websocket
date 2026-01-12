import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';

@Controller()
export class ChatController {
  constructor(private readonly chatGateway: ChatGateway) {}

  @Post('notify-inspection')
  notifyInspection(@Body() body: { userId: string; inspectionId: string; vehicleId: string; message: string }) {
    const { userId, inspectionId, vehicleId, message } = body;

    if (!userId || !inspectionId) {
      throw new BadRequestException('userId and inspectionId are required');
    }

    this.chatGateway.notifyInspection(userId, inspectionId, vehicleId, message);
    return { success: true, message: 'Notification sent' };
  }

  @Post('notify-users')
  notifyUsers(@Body() body: { userIds: string[]; title: string; message: string; data?: any }) {
    const { userIds, title, message, data } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new BadRequestException('userIds array is required');
    }

    this.chatGateway.notifyUsers(userIds, title, message, data);
    return { success: true, message: 'Notifications sent' };
  }
}
