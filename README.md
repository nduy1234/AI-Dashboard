# AI Revenue Command Center (Monorepo)

A production-ready Enterprise AI platform designed to automate pipeline generation for B2B companies. This project is a TypeScript monorepo powered by **pnpm workspaces**, featuring an Express 5 backend and a React + Vite frontend.

## 🚀 Key Features

- **Omni-Channel AI Agents**: Lead sourcing, verification, and personalized outbound sequencing.
- **CRM Reactivation**: Intelligent AI agents to breathe life into dormant leads.
- **Website Conversion**: Real-time AI chat widget for visitor qualification and booking.
- **Advanced Analytics**: Real-time tracking of open rates, reply rates, and pipeline health.
- **Multi-Tenant Architecture**: Built-in support for Organizations and Team management.

## 🛠️ Technical Stack

- **Frontend**: React 18, Vite, Tailwind CSS, shadcn/ui, wouter, TanStack Query.
- **Backend**: Express 5 (ESM), Node.js 24+, OpenID Connect (Google OAuth).
- **Database**: PostgreSQL with **Drizzle ORM** for type-safe queries.
- **AI**: OpenAI GPT-4o integration.
- **Monorepo**: pnpm Workspaces, TypeScript Composite Projects.

## 📁 Project Structure

```text
.
├── artifacts/
│   ├── api-server/          # Express 5 API Server (Port 5000)
│   └── revenue-platform/    # React + Vite Frontend (Port 3000)
├── lib/
│   ├── db/                  # Shared Drizzle ORM schema & DB connection
│   ├── api-zod/             # Shared Zod schemas (generated from OpenAPI)
│   ├── api-client-react/    # Shared React Query hooks (generated from OpenAPI)
│   └── replit-auth-web/     # Shared Authentication hooks
├── package.json             # Root monorepo configuration
└── pnpm-workspace.yaml      # Workspace definitions
```

## ⚙️ Getting Started

### 1. Prerequisites
- **Node.js**: Version 24 or higher.
- **pnpm**: Version 10 or higher.
- **PostgreSQL**: A running instance with a database created.

### 2. Installation
Install all dependencies for the entire monorepo:
```bash
pnpm install
```

### 3. Environment Setup
Create a `.env` file in the root directory:
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/your_db"

# OpenAI
AI_INTEGRATIONS_OPENAI_API_KEY="sk-..."
AI_INTEGRATIONS_OPENAI_BASE_URL="https://api.openai.com/v1"

# Google OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Server Config
PUBLIC_URL="http://localhost:3000"
PORT="5000"
VITE_PORT="3000"
```

### 4. Database Setup
Push the schema to your database to create the tables:
```bash
pnpm -C lib/db run push
```

### 5. Running Development
Start both the backend and frontend in parallel:
```bash
pnpm -r --parallel run dev
```
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000`

## 🔨 Build & Production
To build the entire project for production:
```bash
pnpm run build
```

## 📜 License
MIT
