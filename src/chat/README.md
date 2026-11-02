# Chat backend

This feature is under development. Group chat is scoped to the authenticated student's institution, faculty, and department. Direct messages are for students and lecturers. API access must reject moderators and administrators.

## Presence

Authenticated student and lecturer clients send a heartbeat every 25 seconds. The API considers a contact online while their last heartbeat is no more than 60 seconds old. Presence is returned only for eligible chat contacts; moderators and administrators are excluded by the same eligibility checks as messaging.

The current heartbeat registry is process-local memory. This is suitable only for a single backend instance: multiple instances would report incomplete presence because heartbeats are not shared. Before scaling horizontally, replace this registry with shared storage (for example Redis) and use a shared event transport for SSE. Presence is advisory and does not affect message delivery or history.
