# Draw Together – Backend

## Description

Draw Together is a real-time collaborative whiteboard application that allows multiple users to draw, design, and brainstorm together on shared boards. Users can create whiteboards, invite others to collaborate, and see changes appear instantly as participants draw or edit content. All drawing activity is synchronized in real time, while board snapshots are saved only when a user chooses to save, giving full control over when work becomes permanent.

The backend manages authentication, whiteboard access permissions, collaborator management, and snapshot storage, and it provides a real-time communication layer that keeps all connected users in sync.

Built with [NestJS](https://github.com/nestjs/nest) framework and TypeScript.

## Tech Stack

### Backend
- **NestJS** – Progressive Node.js framework
- **Node.js** – JavaScript runtime
- **TypeScript** – Type-safe JavaScript

### Real-Time Communication
- **WebSockets (Socket.IO)** – Real-time collaboration and live updates between users

### Database
- **PostgreSQL** – Relational database for users, whiteboards, collaborators, and snapshots
- **TypeORM** – ORM for database modeling and migrations

### Authentication & Security
- **JWT (JSON Web Tokens)** – User authentication and authorization
- **Passport.js** – Authentication middleware
- **HttpOnly Cookies** – Secure token storage

### Development & Tooling
- **Docker** – Containerized database environment
- **pgAdmin** – Database management interface

## Requirements

### System Requirements
- **Node.js** (v18 or later recommended)
- **npm** or **yarn**
- **PostgreSQL** (local or Docker)
- **Docker** (optional, for database setup)

### Development Tools (Recommended)
- **pgAdmin** – to view and manage PostgreSQL data
- **Git** – version control
- **Postman / Insomnia** – testing REST APIs

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/osid-alkourd/draw-togother-backend
cd draw-togother-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root and provide the required values:

```env
DB_HOST=
DB_PORT=
DB_USERNAME=
DB_PASSWORD=
DB_NAME=
PORT=
JWT_SECRET=
```

### 4. Set up the database

Make sure PostgreSQL is running (locally or via Docker).

Then run database migrations:

```bash
npm run migration:run
```

### 5. Start the server

```bash
# development mode
npm run start
```


## API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| `POST` | `/api/auth/register` | Register a new user | No |
| `POST` | `/api/auth/login` | Login user | No |
| `GET` | `/api/auth/me` | Get current authenticated user | Required |
| `POST` | `/api/auth/logout` | Logout user | Required |

### Whiteboards (`/api/whiteboards`)

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| `POST` | `/api/whiteboards` | Create a new whiteboard | Required |
| `GET` | `/api/whiteboards/my-whiteboards` | Get all whiteboards owned by current user | Required |
| `GET` | `/api/whiteboards/shared-with-me` | Get all whiteboards shared with current user | Required |
| `GET` | `/api/whiteboards/:id` | Get whiteboard by ID (with access check) | Required |
| `PATCH` | `/api/whiteboards/:id/rename` | Rename a whiteboard (owner only) | Required |
| `DELETE` | `/api/whiteboards/:id` | Delete a whiteboard (owner only) | Required |
| `POST` | `/api/whiteboards/:id/collaborators` | Add a collaborator to whiteboard (owner only) | Required |
| `DELETE` | `/api/whiteboards/:id/collaborators` | Remove a collaborator from whiteboard (owner only) | Required |
| `DELETE` | `/api/whiteboards/:id/leave` | Leave a whiteboard (collaborator only) | Required |
| `POST` | `/api/whiteboards/:id/duplicate` | Duplicate a whiteboard (owner only) | Required |

### Snapshots (`/api/whiteboards/:whiteboardId/snapshots`)

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| `POST` | `/api/whiteboards/:whiteboardId/snapshots` | Save or update snapshot for a whiteboard | Required |

### WebSocket Events

The application uses WebSocket connections for real-time collaboration. Connect to the WebSocket server at the same host/port as the REST API.

**Connection**: Requires JWT authentication via cookie or query parameter.

**Events**:
- `join-whiteboard` â€“ Join a whiteboard room
- `leave-whiteboard` â€“ Leave a whiteboard room
- `draw` â€“ Broadcast drawing actions to all users in the room
- `clear-canvas` â€“ Clear the canvas for all users
- `undo` â€“ Undo last action
- `redo` â€“ Redo last undone action
