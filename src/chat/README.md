# Chat backend

Group chat is scoped to the authenticated student's institution, faculty, and department. Direct messages are for students and lecturers. Moderators and administrators are denied at the API.

## Presence and real-time events

Authenticated student and lecturer clients send a heartbeat every 25 seconds. Redis stores each heartbeat under `sophis:chat:presence:<userId>` with a 60-second expiry. The API reports a contact online while that key exists.

All backend instances publish room refresh events to the `sophis:chat:rooms` Redis Pub/Sub channel. Each instance subscribes to that channel and forwards only events for rooms the authenticated SSE client may access. PostgreSQL remains the durable source of message history; Redis is used only for ephemeral presence and event fan-out.

Set `REDIS_URL` on the backend service to the private connection URL for its Redis-compatible service. Production startup fails if this variable is missing, and presence/event operations fail rather than silently reverting to process-local state when Redis is unavailable. For local development, configure `REDIS_URL` or presence will appear offline and live notifications will be unavailable.
