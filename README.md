# Websocket Gateway Refactored

This is a refactored version of the Websocket Gateway using NestJS and TypeORM.

## Setup

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Configure environment variables:
    Copy `.env.example` to `.env` (or create one) and set the following variables:
    ```dotenv
    DB_HOST=localhost
    DB_PORT=3306
    DB_USER=root
    DB_PASSWORD=password
    DB_NAME=auto_box
    PORT=3002
    JWT_SECRET=secretKey
    ```

3.  Run the application:
    ```bash
    npm run start:dev
    ```

## Features

-   **Real-time Chat**: Uses Socket.IO for messaging.
-   **Database Integration**: Stores messages in the `mensaje` table (auto-created if not exists).
-   **Authentication**: Validates JWT tokens on connection.
-   **Notifications**: Endpoint `/notify-inspection` to send system notifications to connected users.

## Database Schema

This service adds a `mensaje` table to the database:

```sql
CREATE TABLE mensaje (
  id VARCHAR(36) PRIMARY KEY,
  remitenteId VARCHAR(36),
  destinatarioId VARCHAR(36),
  contenido TEXT,
  vehiculoId VARCHAR(36),
  leido BOOLEAN DEFAULT FALSE,
  fechaCreacion DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
