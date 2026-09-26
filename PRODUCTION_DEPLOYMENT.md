# Sophia Central Backend - Production Deployment Guide

## Pre-Deployment Checklist

### Security
- [ ] Generate strong JWT secret: `openssl rand -base64 32`
- [ ] Enable HTTPS/TLS on all endpoints
- [ ] Configure database encryption at rest
- [ ] Set up WAF (AWS WAF, Cloudflare)
- [ ] Enable DDoS protection
- [ ] Configure rate limiting
- [ ] Set up API key rotation policies
- [ ] Enable audit logging for all moderation actions
- [ ] Configure secrets management (AWS Secrets Manager, HashiCorp Vault)

### Database
- [ ] Configure connection pooling (min: 5, max: 20)
- [ ] Enable SSL for database connections
- [ ] Set up automated daily backups
- [ ] Configure point-in-time recovery (PITR)
- [ ] Create read replicas for analytics queries
- [ ] Tune PostgreSQL for production (shared_buffers, work_mem, etc.)
- [ ] Create indexes on frequently searched columns
- [ ] Set up database monitoring and alerting

### Infrastructure
- [ ] Set up load balancer (AWS ALB, Nginx)
- [ ] Configure auto-scaling groups
- [ ] Set up health checks and monitoring
- [ ] Enable VPC security groups and network ACLs
- [ ] Configure CloudFront or CDN for static assets
- [ ] Set up monitoring and logging (CloudWatch, ELK, DataDog)
- [ ] Configure Sentry for error tracking
- [ ] Set up uptime monitoring (Pingdom, UptimeRobot)

### File Storage
- [ ] Create S3 bucket with versioning enabled
- [ ] Enable S3 encryption (SSE-S3 or SSE-KMS)
- [ ] Configure S3 CORS policy for frontend
- [ ] Enable S3 access logging
- [ ] Set up S3 lifecycle policies (archive old files after 90 days)
- [ ] Configure CloudFront distribution for file serving
- [ ] Set up virus scanning for uploads (ClamAV via Lambda)

### AI Integration
- [ ] Verify OpenAI or Anthropic account and API keys
- [ ] Set up usage monitoring and alerts
- [ ] Configure rate limiting per user (e.g., 10 requests/day)
- [ ] Implement token usage tracking and billing
- [ ] Set up fallback mechanisms

### Monitoring & Alerting
- [ ] Set up CloudWatch dashboards
- [ ] Configure alerts for:
  - Database CPU > 80%
  - Database connections > 80%
  - API error rate > 1%
  - API latency p99 > 5 seconds
  - S3 upload failures > 5%
  - Disk space < 20%
- [ ] Set up on-call rotation
- [ ] Configure incident response procedures

## Environment Configuration

### Production Environment Variables

```bash
# Generate these securely
JWT_SECRET=$(openssl rand -base64 32)
DB_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)

# Store in AWS Secrets Manager or similar
aws secretsmanager create-secret \
  --name sophia-central/prod \
  --secret-string "{
    \"JWT_SECRET\": \"$JWT_SECRET\",
    \"DB_PASSWORD\": \"$DB_PASSWORD\",
    \"REDIS_PASSWORD\": \"$REDIS_PASSWORD\",
    \"OPENAI_API_KEY\": \"your-key-here\",
    \"AWS_ACCESS_KEY_ID\": \"your-key-here\",
    \"AWS_SECRET_ACCESS_KEY\": \"your-key-here\"
  }"
```

## Deployment Steps

### Option 1: AWS ECS + RDS + S3

1. **Build and push Docker image**:
   ```bash
   docker build -t sophia-central-backend:latest .
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
   docker tag sophia-central-backend:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/sophia-central-backend:latest
   docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/sophia-central-backend:latest
   ```

2. **Create RDS PostgreSQL instance**:
   ```bash
   aws rds create-db-instance \
     --db-instance-identifier sophia-central-prod \
     --db-instance-class db.t3.medium \
     --engine postgres \
     --master-username sophia \
     --master-user-password $DB_PASSWORD \
     --allocated-storage 100 \
     --storage-type gp3 \
     --vpc-security-group-ids sg-xxxxx \
     --backup-retention-period 30 \
     --enable-iam-database-authentication \
     --enable-cloudwatch-logs-exports postgresql
   ```

3. **Create ECS cluster and task definition**:
   ```bash
   # See Terraform/CloudFormation templates in infrastructure/ directory
   ```

4. **Run database migrations**:
   ```bash
   npm run typeorm:migration:run -- -d src/database/typeorm.config.ts
   ```

5. **Seed essential data**:
   ```bash
   curl -X POST https://api.sophia-central.com/seed/run \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

### Option 2: Kubernetes (EKS)

1. **Create Docker image**:
   ```bash
   docker build -t sophia-central-backend:latest .
   ```

2. **Deploy to EKS**:
   ```bash
   kubectl apply -f kubernetes/namespace.yaml
   kubectl apply -f kubernetes/configmap.yaml
   kubectl apply -f kubernetes/secret.yaml
   kubectl apply -f kubernetes/deployment.yaml
   kubectl apply -f kubernetes/service.yaml
   kubectl apply -f kubernetes/ingress.yaml
   ```

3. **Verify deployment**:
   ```bash
   kubectl get pods -n sophia-central
   kubectl logs -f deployment/sophia-central-backend -n sophia-central
   ```

## Post-Deployment Verification

1. **Health check**:
   ```bash
   curl https://api.sophia-central.com/health
   ```

2. **API documentation**:
   ```bash
   curl https://api.sophia-central.com/api/docs
   ```

3. **Database connectivity**:
   ```bash
   curl -X GET https://api.sophia-central.com/analytics/overview \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

4. **S3 connectivity**:
   ```bash
   curl -X POST https://api.sophia-central.com/storage/presigned-url \
     -H "Authorization: Bearer $USER_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "fileName": "test.pdf",
       "fileSize": 1048576,
       "fileType": "application/pdf",
       "resourceId": "test-resource"
     }'
   ```

5. **AI integration**:
   ```bash
   curl -X POST https://api.sophia-central.com/ai/ask \
     -H "Authorization: Bearer $USER_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "question": "What is machine learning?"
     }'
   ```

## Monitoring & Maintenance

### Daily Tasks
- Review error logs in Sentry
- Check database performance metrics
- Monitor S3 upload success rate
- Verify backup completion

### Weekly Tasks
- Review moderation queue statistics
- Check user growth metrics
- Monitor API latency trends
- Review cost optimization opportunities

### Monthly Tasks
- Database optimization (VACUUM, ANALYZE)
- Review and update security policies
- Capacity planning review
- Cost analysis and forecasting

## Scaling Considerations

### Horizontal Scaling
- Use auto-scaling groups (min: 3, max: 10)
- Implement session affinity or distributed sessions
- Use load balancer with health checks
- Cache frequently accessed data (Redis)

### Vertical Scaling
- Database: Upgrade from db.t3.medium to db.t3.large
- Cache: Increase Redis memory from 1GB to 10GB
- Application servers: Increase CPU/memory allocation

### Database Optimization
- Add indexes on frequently queried columns
- Implement query result caching
- Use read replicas for analytics
- Partition large tables by date/institution

## Disaster Recovery

### Backup Strategy
- Daily automated RDS backups (retention: 30 days)
- Weekly full backups stored in separate region
- Monthly backups archived to Glacier
- Test restore procedures monthly

### Failover Plan
- Multi-AZ RDS deployment (automatic failover)
- Read replicas in different AZs
- Database state replication to standby region
- DNS failover (Route 53 health checks)

### Recovery Time Objectives (RTO)
- Database failure: < 5 minutes (RDS auto-failover)
- S3 failure: < 1 hour (use backup bucket)
- Application server failure: < 2 minutes (load balancer)
- Complete region failure: < 30 minutes (failover to standby region)

## Security Hardening

### Network Security
- Enable VPC Flow Logs
- Restrict inbound traffic to HTTPS only (port 443)
- Use security groups to limit database access
- Enable GuardDuty for threat detection

### Application Security
- Enable HSTS headers
- Implement rate limiting (100 req/min per IP)
- Add request signing for admin endpoints
- Implement CSRF protection
- Regular security audits

### Data Security
- Enable RDS encryption at rest
- Use SSL/TLS for all database connections
- Enable S3 bucket encryption
- Enable CloudTrail for API auditing
- Implement data masking for sensitive fields

## Cost Optimization

- Use Spot instances for non-critical workloads
- Reserve capacity for predictable workloads
- Implement S3 lifecycle policies (archive after 90 days)
- Use CloudFront for media distribution
- Monitor and optimize database queries
- Use Lambda for background jobs instead of always-on servers

---

**Last Updated**: 2026-09-26
