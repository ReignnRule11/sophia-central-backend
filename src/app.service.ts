import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'sophia-central-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
