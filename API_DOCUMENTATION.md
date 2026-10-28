# Sophis Central Backend API - Complete Guide

## Table of Contents
1. [Authentication](#authentication)
2. [User Management](#user-management)
3. [Institutions & Courses](#institutions--courses)
4. [Resources](#resources)
5. [Moderation](#moderation)
6. [Points System](#points-system)
7. [Referrals](#referrals)
8. [Storage](#storage)
9. [Search & Discovery](#search--discovery)
10. [AI Study Assistant](#ai-study-assistant)
11. [Analytics](#analytics)
12. [Error Handling](#error-handling)

---

## Authentication

### Register New User
```http
POST /auth/register
Content-Type: application/json

{
  "firstName": "Ayomide",
  "lastName": "Student",
  "email": "ayomide@example.com",
  "password": "SecurePassword123",
  "institution": "University of Lagos",
  "faculty": "Science",
  "department": "Computer Science"
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "ayomide@example.com",
      "firstName": "Ayomide",
      "lastName": "Student",
      "role": "student"
    }
  },
  "timestamp": "2026-09-26T14:00:00Z"
}
```

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "ayomide@example.com",
  "password": "SecurePassword123"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "ayomide@example.com",
      "firstName": "Ayomide",
      "lastName": "Student",
      "role": "student"
    }
  },
  "timestamp": "2026-09-26T14:00:00Z"
}
```

### Get Current User
```http
GET /auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "ayomide@example.com",
    "firstName": "Ayomide",
    "lastName": "Student",
    "role": "student",
    "institution": "University of Lagos",
    "isVerified": false,
    "createdAt": "2026-09-26T10:00:00Z",
    "updatedAt": "2026-09-26T10:00:00Z"
  },
  "timestamp": "2026-09-26T14:00:00Z"
}
```

---

## User Management

### Update User Profile
```http
PATCH /users/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Ayomide",
  "institution": "University of Ibadan",
  "department": "Software Engineering"
}
```

### Get User Profile
```http
GET /users/me
Authorization: Bearer <token>
```

### List All Users (Admin Only)
```http
GET /users
Authorization: Bearer <admin-token>
```

---

## Institutions & Courses

### Create Institution
```http
POST /institutions
Content-Type: application/json

{
  "name": "University of Lagos",
  "country": "Nigeria",
  "city": "Lagos"
}
```

### Get All Institutions
```http
GET /institutions
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "inst-001",
      "name": "University of Lagos",
      "country": "Nigeria",
      "city": "Lagos",
      "faculties": [
        {
          "id": "fac-001",
          "name": "Faculty of Science",
          "departments": [
            {
              "id": "dept-001",
              "name": "Computer Science"
            }
          ]
        }
      ],
      "createdAt": "2026-09-26T10:00:00Z"
    }
  ]
}
```

### Create Course
```http
POST /courses
Content-Type: application/json

{
  "title": "Introduction to Computer Programming",
  "code": "CSC101",
  "description": "Fundamentals of programming with Python",
  "level": "100",
  "institutionId": "inst-001"
}
```

### Get Courses
```http
GET /courses?institutionId=inst-001&level=100
```

---

## Resources

### Upload Resource
```http
POST /resources
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Python Programming Basics",
  "description": "Comprehensive lecture notes on Python programming fundamentals",
  "type": "lecture_notes",
  "course": "Introduction to Computer Programming",
  "topic": "Variables and Data Types",
  "institution": "University of Lagos",
  "level": "100",
  "fileUrl": "https://s3.example.com/resources/python-basics.pdf"
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "res-001",
    "title": "Python Programming Basics",
    "description": "Comprehensive lecture notes on Python programming fundamentals",
    "type": "lecture_notes",
    "course": "Introduction to Computer Programming",
    "topic": "Variables and Data Types",
    "institution": "University of Lagos",
    "level": "100",
    "fileUrl": "https://s3.example.com/resources/python-basics.pdf",
    "moderationStatus": "pending",
    "isVerified": false,
    "views": 0,
    "downloads": 0,
    "uploader": {
      "id": "user-001",
      "email": "ayomide@example.com",
      "firstName": "Ayomide"
    },
    "createdAt": "2026-09-26T14:00:00Z"
  }
}
```

### Get Resource
```http
GET /resources/res-001
```

### Update Resource
```http
PATCH /resources/res-001
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated Python Programming Basics",
  "description": "Enhanced lecture notes"
}
```

### Delete Resource
```http
DELETE /resources/res-001
Authorization: Bearer <token>
```

---

## Moderation

### Get Moderation Queue (Moderator/Admin)
```http
GET /moderation/queue
Authorization: Bearer <moderator-token>
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "res-001",
      "title": "Python Programming Basics",
      "moderationStatus": "pending",
      "uploader": {
        "id": "user-001",
        "firstName": "Ayomide",
        "email": "ayomide@example.com"
      },
      "createdAt": "2026-09-26T14:00:00Z"
    }
  ]
}
```

### Review Resource (Approve/Reject)
```http
PATCH /moderation/resources/res-001/review
Authorization: Bearer <moderator-token>
Content-Type: application/json

{
  "status": "approved",
  "note": "Well-written notes, approved for publication",
  "reviewerId": "moderator-id"
}
```

**Status Values**:
- `approved` — Resource is verified and public
- `rejected` — Resource does not meet standards
- `flagged` — Resource needs further review

---

## Points System

### Get User's Point Balance
```http
GET /points/user-001/balance
```

**Response**:
```json
{
  "success": true,
  "data": 150,
  "timestamp": "2026-09-26T14:00:00Z"
}
```

### Get Transaction History
```http
GET /points/user-001/transactions?limit=20
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "txn-001",
      "userId": "user-001",
      "type": "earned",
      "amount": 50,
      "reason": "Resource approved: Python Programming Basics",
      "createdAt": "2026-09-26T14:00:00Z"
    },
    {
      "id": "txn-002",
      "userId": "user-001",
      "type": "earned",
      "amount": 25,
      "reason": "Referral redeemed: SOPHIA1234",
      "createdAt": "2026-09-26T13:45:00Z"
    }
  ]
}
```

### Award Points (Admin)
```http
POST /points/award
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "userId": "user-001",
  "amount": 100,
  "reason": "Academic achievement bonus"
}
```

---

## Referrals

### Create Referral Code
```http
POST /referrals/create
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "code": "SOPHIA1234AB",
    "referrerId": "user-001",
    "isActive": true,
    "createdAt": "2026-09-26T14:00:00Z"
  }
}
```

### Get My Referral Code
```http
GET /referrals/my-code
Authorization: Bearer <token>
```

### Get Referral Details
```http
GET /referrals/SOPHIA1234AB
```

**Response**:
```json
{
  "success": true,
  "data": {
    "code": "SOPHIA1234AB",
    "referrerName": "Ayomide Student",
    "isActive": true
  }
}
```

### Redeem Referral Code
```http
POST /referrals/redeem
Authorization: Bearer <new-student-token>
Content-Type: application/json

{
  "code": "SOPHIA1234AB"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "pointsAwarded": 50
  }
}
```

### Get Referral Statistics
```http
GET /referrals/stats/overview
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "totalReferrals": 5,
    "successfulReferrals": 3,
    "estimatedPointsEarned": 150
  }
}
```

---

## Storage

### Get Presigned Upload URL
```http
POST /storage/presigned-url
Authorization: Bearer <token>
Content-Type: application/json

{
  "fileName": "my-notes.pdf",
  "fileSize": 2097152,
  "fileType": "application/pdf",
  "resourceId": "res-001"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "presignedUrl": "https://s3.amazonaws.com/sophia-central/resources/res-001/upload-id/my-notes.pdf?AWSAccessKeyId=...",
    "uploadId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "fileName": "my-notes.pdf",
    "resourceId": "res-001",
    "expiresIn": 3600
  }
}
```

**Supported MIME Types**:
- `application/pdf` — PDF documents
- `application/msword` — Microsoft Word (.doc)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` — Word (.docx)
- `application/vnd.ms-powerpoint` — PowerPoint (.ppt)
- `application/vnd.openxmlformats-officedocument.presentationml.presentation` — PowerPoint (.pptx)
- `text/plain` — Text files
- `image/jpeg`, `image/png` — Images

**Max File Size**: 100 MB

### Confirm Upload
```http
POST /storage/confirm-upload
Authorization: Bearer <token>
Content-Type: application/json

{
  "uploadId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "resourceId": "res-001"
}
```

---

## Search & Discovery

### Full-Text Search
```http
GET /search?q=python+programming&course=CSC101&level=100&institution=University+of+Lagos&type=lecture_notes
```

**Query Parameters**:
- `q` — Search keyword
- `course` — Filter by course name
- `institution` — Filter by institution
- `level` — Filter by academic level (100, 200, 300, 400, postgraduate)
- `type` — Filter by resource type (lecture_notes, past_question, research_paper, project, slides, other)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "res-001",
      "title": "Python Programming Basics",
      "description": "Comprehensive lecture notes on Python programming fundamentals",
      "type": "lecture_notes",
      "course": "Introduction to Computer Programming",
      "topic": "Variables and Data Types",
      "institution": "University of Lagos",
      "level": "100",
      "views": 42,
      "downloads": 18,
      "isVerified": true,
      "uploader": {
        "id": "user-001",
        "firstName": "Ada",
        "lastName": "Professor"
      },
      "createdAt": "2026-09-26T10:00:00Z"
    }
  ]
}
```

---

## AI Study Assistant

### Ask AI About Material
```http
POST /ai/ask
Authorization: Bearer <token>
Content-Type: application/json

{
  "question": "What are the differences between list and tuple in Python?",
  "resourceId": "res-001"
}
```

**Response** (MVP - integration ready):
```json
{
  "success": true,
  "data": {
    "status": "queued",
    "provider": "openai",
    "userId": "user-001",
    "resourceId": "res-001",
    "question": "What are the differences between list and tuple in Python?",
    "message": "AI provider integration is ready to be connected."
  }
}
```

---

## Analytics (Admin)

### Platform Overview
```http
GET /analytics/overview
Authorization: Bearer <admin-token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "totalResources": 1250,
    "approvedResources": 1100,
    "pendingResources": 150,
    "totalUsers": 5430,
    "lecturers": 320,
    "admins": 12,
    "verificationRate": "88.00%"
  }
}
```

### Resource Statistics
```http
GET /analytics/resources
Authorization: Bearer <admin-token>
```

### User Statistics
```http
GET /analytics/users
Authorization: Bearer <admin-token>
```

### Trending Resources
```http
GET /analytics/trending?limit=10
Authorization: Bearer <admin-token>
```

---

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "statusCode": 400,
  "message": {
    "message": "Validation failed",
    "error": "Bad Request"
  },
  "timestamp": "2026-09-26T14:00:00Z"
}
```

### Common Error Codes

| Code | Message | Solution |
|------|---------|----------|
| 400 | Bad Request | Check request body and parameters |
| 401 | Unauthorized | Provide valid JWT token |
| 403 | Forbidden | You don't have permission for this action |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Email already exists or duplicate entry |
| 422 | Validation Failed | Check input data format |
| 500 | Internal Server Error | Contact support |

---

## Authentication Header

All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```

Retrieve token from `/auth/login` or `/auth/register` response.

---

**Last Updated**: 2026-09-26
