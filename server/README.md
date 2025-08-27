# Playwright Test Automation Backend

This is the backend service for the Playwright Test Automation Tool, providing browser automation, session management, and real-time communication capabilities.

## Features

- **Browser Automation**: Full Playwright integration with Chromium, Firefox, and WebKit
- **Session Management**: Isolated test recording sessions with persistent storage
- **Real-time Communication**: WebSocket-based live updates between frontend and backend
- **Self-Healing Tests**: Intelligent fallback selector generation and validation
- **Code Generation**: Automatic TypeScript Playwright test generation
- **CI/CD Integration**: Support for GitHub Actions, GitLab CI, Jenkins, and more
- **RESTful API**: Comprehensive REST endpoints for all operations

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js with TypeScript
- **Browser Automation**: Playwright
- **Real-time**: Socket.io
- **Database**: SQLite with better-sqlite3
- **Validation**: Joi
- **Logging**: Winston
- **Testing**: Jest

## Quick Start

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone the repository and navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install
```

4. Copy environment variables:
```bash
cp .env.example .env
```

5. Start the development server:
```bash
npm run dev
```

The server will start on `http://localhost:3001`

## API Documentation

### Session Management

#### Create New Session
```http
POST /api/session/new
Content-Type: application/json

{
  "testName": "Login Flow Test",
  "targetUrl": "https://example.com",
  "settings": {
    "healingStrategies": ["attribute_matching", "text_content_matching"],
    "confidenceThreshold": 0.8
  }
}
```

#### Start Recording
```http
POST /api/session/:sessionId/start
```

#### Add Step
```http
POST /api/session/:sessionId/step
Content-Type: application/json

{
  "type": "click",
  "selector": "#submit-button",
  "description": "Click submit button",
  "actionParams": {}
}
```

#### Export Test Code
```http
GET /api/export/:sessionId?format=json
```

### WebSocket Events

Connect to `/` namespace and emit/listen for these events:

- `join-session` - Join a session room
- `recording:start` - Start recording
- `step:add` - Add a new step
- `step:recorded` - Step was recorded (broadcast)
- `session:error` - Error occurred

## Architecture

### Core Components

1. **BrowserManager**: Manages Playwright browser instances and contexts
2. **SessionManager**: Handles test session lifecycle and step management
3. **WebSocketManager**: Real-time communication with frontend clients
4. **SelfHealingEngine**: Generates fallback selectors and validates elements
5. **CodeGenerator**: Converts recorded steps to Playwright TypeScript code

### Database Schema

The application uses SQLite with the following main tables:

- `sessions`: Test session metadata
- `steps`: Individual test steps with selectors and parameters

### File Structure

```
server/
├── src/
│   ├── config/          # Database and configuration
│   ├── middleware/      # Express middleware
│   ├── routes/          # API route handlers
│   ├── services/        # Core business logic
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   └── server.ts        # Main server entry point
├── data/                # SQLite database files
├── logs/                # Application logs
├── recordings/          # Session recordings and videos
└── package.json
```

## Development

### Available Scripts

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Environment Variables

Key environment variables (see `.env.example`):

- `PORT`: Server port (default: 3001)
- `FRONTEND_URL`: Frontend URL for CORS
- `NODE_ENV`: Environment (development/production)
- `LOG_LEVEL`: Logging level (debug/info/warn/error)
- `DATABASE_URL`: SQLite database path

### Adding New Features

1. **New API Endpoints**: Add routes in `src/routes/`
2. **Business Logic**: Implement in `src/services/`
3. **Database Changes**: Update schema in `src/config/database.ts`
4. **WebSocket Events**: Add to `src/services/WebSocketManager.ts`

## Self-Healing Strategies

The backend implements multiple self-healing strategies:

1. **Attribute Matching**: Generate selectors based on element attributes
2. **Text Content Matching**: Find elements by visible text content
3. **Positional Matching**: Locate elements by relative position
4. **Semantic Similarity**: Use ARIA roles and semantic HTML
5. **Visual AI Matching**: Image-based element detection (future)

## Browser Automation

### Supported Browsers

- Chromium (default)
- Firefox
- WebKit (Safari)

### Recording Features

- Automatic event capture (clicks, inputs, navigation)
- Screenshot generation
- Network request logging
- Console message capture
- Video recording of sessions

## Deployment

### Docker

Build and run with Docker:

```bash
docker build -t playwright-backend .
docker run -p 3001:3001 playwright-backend
```

### Production Considerations

1. **Environment**: Set `NODE_ENV=production`
2. **Database**: Consider PostgreSQL for production
3. **Logging**: Configure log rotation and monitoring
4. **Security**: Enable HTTPS and proper CORS settings
5. **Scaling**: Use PM2 or similar for process management

## Testing

The backend includes comprehensive tests:

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- SessionManager.test.ts
```

## Monitoring and Logging

### Logging

Winston is configured for structured logging:

- `logs/error.log`: Error-level logs
- `logs/combined.log`: All logs
- Console output in development

### Health Check

Monitor application health:

```http
GET /health
```

Returns system status, uptime, memory usage, and active sessions.

## Security

### Implemented Security Measures

- Helmet.js for security headers
- CORS configuration
- Rate limiting
- Input validation with Joi
- SQL injection prevention
- XSS protection

### Best Practices

1. Keep dependencies updated
2. Use environment variables for secrets
3. Implement proper authentication (JWT ready)
4. Validate all inputs
5. Log security events

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## Troubleshooting

### Common Issues

**Port already in use**:
```bash
lsof -ti:3001 | xargs kill -9
```

**Playwright browser issues**:
```bash
npx playwright install --force
```

**Database locked**:
```bash
rm data/playwright-automation.db
npm run dev  # Will recreate database
```

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm run dev
```

## License

MIT License - see LICENSE file for details.