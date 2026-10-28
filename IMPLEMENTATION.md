# Sophis Central Backend - MVP Implementation

## Project Overview

Sophis Central is a **centralized academic resource and research platform** designed to solve the student pain point of scattered educational materials across multiple platforms. This backend powers the MVP with authentication, content moderation, rewards systems, and AI-assisted learning.

## Problem Statement

**81%** of students spend over 21 minutes searching for academic resources, and **58%** report that materials are scattered across too many platforms. Sophis Central consolidates trusted academic resources into one place where students can:

- Search resources by course, topic, institution, and level
- Upload and share verified materials
- Earn Wisdom Points for contributions
- Access AI-powered study assistance
- Discover trending and highly-rated content

## Solution Architecture

The Sophis Central backend is built as a **modular, production-ready NestJS application** with clear separation of concerns:

### Core Modules

```
src/
├── auth/              # JWT authentication, login, registration
├── users/             # User profiles, roles, preferences
├── resources/         # Academic materials CRUD and management
├── search/            # Full-text search and filtering
├── moderation/        # Content review and approval workflow
├── institutions/      # Schools, faculties, departments hierarchy
├── courses/           # Courses and topics organization
├── points/            # Wisdom Points wallet and transactions
├── referrals/         # Referral program tracking
├── storage/           # S3/MinIO file upload integration
├── ai/                # AI study assistant boundary
├── analytics/         # Admin dashboard metrics
├── seed/              # Demo data seeding
├── common/            # Guards, decorators, filters, interceptors
└── config/            # Database and environment configuration
```

## Key Features Implemented

### ✅ Authentication & Authorization
- JWT-based stateless authentication
- Role-based access control (RBAC): Student, Lecturer, Moderator, Admin
- Password hashing with bcrypt
- Secure token refresh and expiration

### ✅ Academic Domain
- Institution → Faculty → Department → Course → Topic hierarchy
- Flexible resource linking to courses and institutions
- Support for multiple academic levels (100, 200, 300, 400, Postgraduate)

### ✅ Content Moderation
- Resource lifecycle: Draft → Pending Review → Approved/Rejected/Flagged
- Moderator queue for pending resources
- Audit trail of all review decisions
- Automatic verification flag on approval

### ✅ Wisdom Points Economy
- Per-user point wallet with balance tracking
- Transaction ledger (Earned, Spent, Bonus)
- Point award reasons for transparency
- Foundation for premium feature gating

### ✅ Referral Program
- Unique referral code generation per user
- Referral redemption tracking
- Referral statistics and analytics
- Point rewards for successful referrals

### ✅ File Storage
- Presigned URL generation for secure uploads
- MIME type validation (PDF, DOCX, PPTX, images, text)
- File size enforcement (100MB limit)
- S3/MinIO compatible backend

### ✅ AI Study Assistant
- Integration boundary for LLM providers
- Environment-based provider configuration
- Ready for OpenAI, Anthropic, or local models
- Usage tracking and quota management ready

### ✅ Admin Analytics
- Platform overview metrics (users, resources, verification rate)
- Resource statistics by type
- User statistics by role
- Trending resources by views/downloads

### ✅ Search & Discovery
- Full-text search by title, description, topic, course
- Filtering by institution, level, resource type
- Sorting by recency, popularity, relevance
- Only approved resources in public search

## API Endpoints

### Authentication
```
POST   /auth/register          Register a new user
POST   /auth/login             Log in and get JWT token
GET    /auth/me                Get current user profile
```

### Users
```
GET    /users                  List all users (admin/moderator)
GET    /users/me               Get my profile
PATCH  /users/:id              Update user
DELETE /users/:id              Delete user (admin)
```

### Institutions
```
POST   /institutions           Create institution
GET    /institutions           List institutions with hierarchy
GET    /institutions/:id       Get institution details
PATCH  /institutions/:id       Update institution
DELETE /institutions/:id       Delete institution
```

### Courses
```
POST   /courses                Create course
GET    /courses                List courses (with optional institution filter)
GET    /courses/:id            Get course with topics
PATCH  /courses/:id            Update course
DELETE /courses/:id            Delete course
```

### Resources
```
POST   /resources              Upload new resource
GET    /resources              List all resources
GET    /resources/:id          Get resource details
PATCH  /resources/:id          Update resource
DELETE /resources/:id          Delete resource
```

### Search
```
GET    /search?q=...&course=...&institution=...&level=...
       Full-text search with filters
```

### Moderation
```
GET    /moderation/queue       Get pending resources (moderator/admin)
PATCH  /moderation/resources/:id/review
       Review and approve/reject resource (moderator/admin)
```

### Storage
```
POST   /storage/presigned-url  Get upload URL for file
POST   /storage/confirm-upload Confirm upload completion
```

### Points
```
GET    /points/:userId/balance         Get user's point balance
GET    /points/:userId/transactions    Get transaction history
POST   /points/award                   Award points to user (admin)
```

### Referrals
```
POST   /referrals/create               Create my referral code
GET    /referrals/my-code              Get my referral code
GET    /referrals/:code                Get referral details
POST   /referrals/redeem               Redeem a referral code
GET    /referrals/stats/overview       Get my referral statistics
```

### AI Study Assistant
```
POST   /ai/ask                 Ask question about academic material
```

### Analytics (Admin)
```
GET    /analytics/overview     Platform metrics
GET    /analytics/resources    Resource statistics
GET    /analytics/users        User statistics
GET    /analytics/trending     Trending resources
```

### Seed (Development)
```
POST   /seed/run               Load demo data
```

## Database Schema

### Core Tables

**users**
- id (UUID)
- email (unique)
- password (hashed)
- firstName, lastName
- role (enum: student, lecturer, moderator, admin)
- institution, department, faculty (optional)
- isVerified
- createdAt, updatedAt

**resources**
- id (UUID)
- title, description
- type (enum: lecture_notes, past_question, research_paper, project, slides, other)
- course, topic, institution, level
- fileUrl
- moderationStatus (enum: draft, pending, approved, rejected, flagged)
- isVerified
- views, downloads (counters)
- uploaderId (FK → users)
- createdAt, updatedAt

**institutions**
- id (UUID)
- name
- country, city
- createdAt, updatedAt

**faculties**
- id (UUID)
- name
- institutionId (FK → institutions)
- createdAt, updatedAt

**departments**
- id (UUID)
- name
- facultyId (FK → faculties)
- createdAt, updatedAt

**courses**
- id (UUID)
- title, code, description
- level
- institutionId (FK → institutions)
- createdAt, updatedAt

**course_topics**
- id (UUID)
- title, description
- courseId (FK → courses)
- createdAt, updatedAt

**moderation_reviews**
- id (UUID)
- resourceId (FK → resources)
- reviewerId (FK → users)
- status (enum: draft, pending, approved, rejected, flagged)
- note (optional)
- createdAt

**point_wallets**
- id (UUID)
- userId (unique)
- balance
- createdAt, updatedAt

**point_transactions**
- id (UUID)
- userId
- type (enum: earned, spent, bonus)
- amount
- reason (optional)
- createdAt

**referrals**
- id (UUID)
- code (unique)
- referrerId (FK → users)
- referredUserId (FK → users, nullable)
- isActive
- redeemedAt (nullable)
- createdAt, updatedAt

## Demo Credentials

The seed endpoint creates demo users for testing:

```
Admin User:
  Email: admin@sophia-central.com
  Password: password123 (hashed)
  Role: Admin

Lecturer User:
  Email: lecturer@sophia-central.com
  Password: password123 (hashed)
  Role: Lecturer

Student User:
  Email: student@sophia-central.com
  Password: password123 (hashed)
  Role: Student
```

**Sample Resources** are also seeded:
- Introduction to Computer Programming (Lecture Notes)
- Microeconomics Past Questions (Past Questions)
- Final Year Project Guide (Project)

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- Docker (recommended for quick setup)

### Local Development Setup

1. **Clone and install**:
   ```bash
   git clone https://github.com/ReignnRule11/sophia-central-backend.git
   cd sophia-central-backend
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Update .env with your database credentials
   ```

3. **Start services**:
   ```bash
   docker-compose up -d
   ```

4. **Run the application**:
   ```bash
   npm run start:dev
   ```

5. **Load demo data**:
   ```bash
   curl -X POST http://localhost:3000/seed/run
   ```

6. **Access the API**:
   - Swagger Docs: http://localhost:3000/api/docs
   - Health: http://localhost:3000/health

### First Steps

1. **Register a new student**:
   ```bash
   curl -X POST http://localhost:3000/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "firstName": "Ayomide",
       "lastName": "Student",
       "email": "ayomide@example.com",
       "password": "SecurePassword123"
     }'
   ```

2. **Login to get token**:
   ```bash
   curl -X POST http://localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "ayomide@example.com",
       "password": "SecurePassword123"
     }'
   ```

3. **Search for resources**:
   ```bash
   curl http://localhost:3000/search?q=programming&level=100
   ```

4. **Get your referral code**:
   ```bash
   curl -H "Authorization: Bearer <token>" \
     http://localhost:3000/referrals/my-code
   ```

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|----------|
| **Framework** | NestJS | 10.4.15 |
| **Language** | TypeScript | 5.5.4 |
| **Database** | PostgreSQL | 14+ |
| **ORM** | TypeORM | 0.3.3 |
| **Authentication** | JWT + Passport | 10.0.0 |
| **Validation** | class-validator | 0.14.1 |
| **API Docs** | Swagger/OpenAPI | 7.0.0 |
| **Password Hashing** | bcryptjs | 2.4.3 |
| **Testing** | Jest | 29.7.0 |

## Security Features

✅ **Implemented**:
- JWT token-based authentication with expiration
- Password hashing with bcrypt (10 rounds)
- Role-based access control (RBAC)
- Input validation with class-validator DTOs
- Global exception handling and error filtering
- CORS configuration
- Request/response transformation interceptors
- Audit trail for all moderation actions
- Secure file upload with MIME validation
- SQL injection protection via TypeORM parameterization

⚠️ **To Add for Production**:
- Rate limiting (express-rate-limit)
- Request logging and monitoring (Sentry, New Relic)
- File upload virus scanning (ClamAV)
- Database encryption at rest
- TLS/HTTPS enforcement
- Secrets management (AWS Secrets Manager, HashiCorp Vault)
- API key rotation policies
- Database backup and disaster recovery
- Network security (WAF, DDoS protection)

## Deployment

### Docker Build
```bash
docker build -t sophia-central-backend:latest .
docker run -p 3000:3000 --env-file .env sophia-central-backend:latest
```

### Environment Variables for Production

```env
# Application
NODE_ENV=production
PORT=3000
APP_URL=https://api.sophia-central.com

# Database
DB_HOST=prod-db.example.com
DB_PORT=5432
DB_USERNAME=sophia_prod
DB_PASSWORD=<secure-password>
DB_DATABASE=sophia_central_prod

# Authentication
JWT_SECRET=<generate-with-openssl-rand-base64-32>
JWT_EXPIRES_IN=1h

# Storage
S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET=sophia-central-prod
S3_ACCESS_KEY=<aws-access-key>
S3_SECRET_KEY=<aws-secret-key>

# AI Provider
AI_PROVIDER=openai
AI_API_KEY=<provider-api-key>

# Redis (for caching/queues)
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong JWT secret (generate: `openssl rand -base64 32`)
- [ ] Enable HTTPS/TLS on all endpoints
- [ ] Configure PostgreSQL connection pooling
- [ ] Set up automated database backups
- [ ] Configure S3 bucket for file storage with encryption
- [ ] Implement rate limiting (100 requests/minute per IP)
- [ ] Set up monitoring (Sentry for errors, DataDog for metrics)
- [ ] Configure logging aggregation (ELK Stack, CloudWatch)
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Enable database audit logging
- [ ] Configure WAF and DDoS protection
- [ ] Implement API key rotation
- [ ] Set up health checks and monitoring

## Project Structure & Patterns

### Module Architecture
Each feature is a self-contained NestJS module with:
- `*.module.ts` — Module definition with imports/exports
- `*.controller.ts` — HTTP request handlers
- `*.service.ts` — Business logic
- `entities/` — TypeORM database entities
- `dto/` — Data transfer objects for validation

### Common Patterns

**Authentication Guard**:
```typescript
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Get('/me')
me(@CurrentUser() user: User) { ... }
```

**Role-Based Access**:
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MODERATOR)
@Get('/admin-only')
adminOnly() { ... }
```

**Input Validation**:
```typescript
export class CreateResourceDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(ResourceType)
  type: ResourceType;
}
```

**Service Injection**:
```typescript
constructor(
  @InjectRepository(Resource)
  private readonly resourceRepository: Repository<Resource>,
  private readonly moderationService: ModerationService,
) {}
```

## Next Steps for Production

1. **File Upload Integration**
   - Connect to AWS S3 or MinIO
   - Implement virus scanning for uploaded files
   - Add file preview generation for PDFs

2. **AI Integration**
   - Connect to OpenAI API or Anthropic Claude
   - Implement token-based usage tracking
   - Add prompt caching for efficiency
   - Set up quotas per user/institution

3. **Notification System**
   - Email notifications on resource approval/rejection
   - Push notifications for trending resources
   - Point earning notifications

4. **Analytics & Reporting**
   - Institution dashboards for their resources
   - Lecturer revenue sharing reports
   - Student learning progress analytics

5. **Performance Optimization**
   - Add Redis caching for search results
   - Implement database query optimization
   - Add CDN for file serving
   - Set up query result pagination

6. **Advanced Moderation**
   - AI-powered duplicate detection
   - Spam and inappropriate content filtering
   - Plagiarism detection integration

7. **Compliance & Legal**
   - GDPR compliance (data export, deletion)
   - Terms of Service enforcement
   - Copyright protection mechanisms
   - Data retention policies

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -m "Add your feature"`
3. Push to branch: `git push origin feature/your-feature`
4. Submit pull request

## Code Style

- Format with Prettier: `npm run format`
- Lint with ESLint: `npm run lint`
- Test with Jest: `npm run test`

## License

MIT License - See LICENSE file for details

## Support

For issues, questions, or contributions, please open a GitHub issue or contact the team.

---

**Build with ❤️ for African students by the Sophis Central team**
