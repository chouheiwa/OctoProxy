# OctoProxy

[中文文档](./README.zh-CN.md) | English

OctoProxy is a multi-account API proxy service that exposes various AI service capabilities through standard OpenAI and Claude API protocols, supporting multi-account pooling, LRU load balancing, health checks, and automatic failover recovery.

## Features

- **Multi-Protocol Support**: Supports both OpenAI and Claude API formats
- **Multi-Account Pooling**: Supports multiple accounts with automatic load balancing
- **Multiple Selection Strategies**: LRU, round-robin, least/most remaining quota priority, etc.
- **OAuth Authentication**: Supports Google, GitHub, AWS Builder ID login
- **Health Checks**: Automatic account status detection with automatic failover recovery
- **Usage Monitoring**: Real-time view of each account's usage
- **Web Admin Interface**: Modern admin interface based on React + Ant Design
- **Multi-language Support**: Supports Chinese and English interface switching
- **Desktop Application**: Cross-platform desktop app based on Electron
- **Docker Support**: One-click deployment, supports amd64/arm64

## Supported Models

| Model Name | Description |
|------------|-------------|
| `claude-opus-4-5` | Claude Opus 4.5 |
| `claude-sonnet-4-5` | Claude Sonnet 4.5 |
| `claude-haiku-4-5` | Claude Haiku 4.5 |
| `claude-sonnet-4-20250514` | Claude Sonnet 4 |
| `claude-3-7-sonnet-20250219` | Claude 3.7 Sonnet |

## Quick Start

### Using Docker (Recommended)

```bash
# Clone the project
git clone https://github.com/your-username/octo-proxy.git
cd octo-proxy

# Start the service
docker-compose up -d

# View logs
docker-compose logs -f
```

After the service starts, visit http://localhost:9091 to access the admin interface.

### Manual Installation

#### Requirements

- Node.js >= 18
- npm or yarn

#### Installation Steps

```bash
# Clone the project
git clone https://github.com/your-username/octo-proxy.git
cd octo-proxy

# Install backend dependencies
npm install

# Install frontend dependencies
cd web && npm install && cd ..

# Build frontend
cd web && npm run build && cd ..
npm run copy:static

# Start service
npm start
```

### Default Configuration

- **Port**: 9091
- **Admin Username**: admin
- **Admin Password**: admin123
- **Database**: data/octo-proxy.db

## Usage

### 1. Add Account

1. Login to admin interface (http://localhost:9091)
2. Go to "Providers" page
3. Click "Add via OAuth"
4. Select authentication method (Google / GitHub / AWS Builder ID)
5. Complete the authorization flow

### 2. Create API Key

1. Go to "API Keys" page
2. Click "Create API Key"
3. Copy the generated key (shown only once)

### 3. Call API

#### OpenAI Format

```bash
curl http://localhost:9091/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "claude-sonnet-4-5",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

#### Claude Format

```bash
curl http://localhost:9091/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-5",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Integration Guide

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "apiUrl": "http://localhost:9091",
  "apiKey": "YOUR_API_KEY"
}
```

### Cursor

1. Open Cursor settings
2. Find Models or OpenAI configuration section
3. Set API URL: `http://localhost:9091/v1`
4. Set API Key: `YOUR_API_KEY`

### Continue (VS Code)

Add to `~/.continue/config.json`:

```json
{
  "models": [{
    "title": "OctoProxy",
    "provider": "openai",
    "model": "claude-sonnet-4-5",
    "apiBase": "http://localhost:9091/v1",
    "apiKey": "YOUR_API_KEY"
  }]
}
```

### Aider

```bash
export OPENAI_API_BASE=http://localhost:9091/v1
export OPENAI_API_KEY=YOUR_API_KEY
aider --model claude-sonnet-4-5
```

## API Endpoints

### Proxy API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/models` | GET | Get available models list |
| `/v1/chat/completions` | POST | OpenAI format chat completions |
| `/v1/messages` | POST | Claude format messages |
| `/health` | GET | Health check |

### Admin API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/login` | POST | Login |
| `/api/providers` | GET/POST | Provider management |
| `/api/api-keys` | GET/POST | API key management |
| `/api/users` | GET/POST | User management |
| `/api/usage` | GET | Usage query |
| `/api/config` | GET/PUT | System configuration |

## Provider Selection Strategies

| Strategy | Description |
|----------|-------------|
| `lru` | Least Recently Used (default, even distribution) |
| `round_robin` | Round Robin (cycle by ID order) |
| `least_usage` | Least Remaining Quota Priority (concentrated consumption) |
| `most_usage` | Most Remaining Quota Priority (balanced consumption) |
| `oldest_first` | Oldest Created Priority (concentrated consumption) |

## Configuration

Configuration file is located at `configs/config.json`:

```json
{
  "port": 9091,
  "host": "0.0.0.0",
  "adminPassword": "admin123",
  "sessionExpireHours": 24,
  "maxErrorCount": 3,
  "healthCheckIntervalMinutes": 10,
  "retries": 3,
  "providerStrategy": "lru",
  "usageSyncIntervalMinutes": 10
}
```

## Directory Structure

```
octo-proxy/
├── src/                    # Backend source code
│   ├── index.js            # Application entry
│   ├── server.js           # HTTP server
│   ├── config.js           # Configuration management
│   ├── db/                 # Database layer
│   ├── kiro/               # Kiro API integration
│   ├── converters/         # Protocol converters
│   ├── middleware/         # Middleware
│   ├── routes/             # Route handlers
│   └── pool/               # Provider pool management
├── web/                    # React frontend
├── electron/               # Electron desktop app
├── configs/                # Configuration files
├── data/                   # Database files
├── Dockerfile              # Docker build file
└── docker-compose.yml      # Docker Compose config
```

## Development

### Development Mode

```bash
# Backend development (hot reload)
npm run dev

# Frontend development
cd web && npm run dev
```

### Build Electron App

```bash
# macOS
npm run electron:build:mac

# Windows
npm run electron:build:win

# Linux
npm run electron:build:linux
```

## Docker Deployment

### Using Docker Compose

```bash
docker-compose up -d
```

### Manual Build

```bash
# Build image
docker build -t octo-proxy .

# Run container
docker run -d \
  --name octo-proxy \
  -p 9091:9091 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/configs:/app/configs \
  --restart unless-stopped \
  octo-proxy
```

### Data Persistence

- `/app/data` - SQLite database files
- `/app/configs` - Configuration files

## FAQ

### Q: How to reset admin password?

Delete the `configs/config.json` file and restart the service, it will use the default password `admin123`.

### Q: What to do if account shows unhealthy?

1. Check if the account has expired or been disabled
2. Try manually clicking the "Check" button
3. View the error message and handle accordingly

### Q: How to view API call logs?

Set `"debug": true` in `configs/config.json`, restart the service to output detailed logs.

### Q: Does it support streaming output?

Yes. Set `"stream": true` in the request to enable streaming output.

## License

MIT License

## Contributing

Issues and Pull Requests are welcome!
