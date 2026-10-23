import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get<string>('NODE_ENV') === 'production';
        const jwtSecret = config.get<string>('JWT_SECRET');
        if (isProduction && (!jwtSecret || jwtSecret.length < 32)) {
          throw new Error('JWT_SECRET must be set to at least 32 characters in production');
        }
        return {
          secret: jwtSecret || 'sophia-central-dev-secret',
          signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') || '1h' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
