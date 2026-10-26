import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetEmailService } from './password-reset-email.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    UsersModule,
    TypeOrmModule.forFeature([PasswordResetToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const isProduction = config.get<string>('NODE_ENV') === 'production';
        const jwtSecret = config.get<string>('JWT_SECRET');
        if (isProduction && (!jwtSecret || jwtSecret.length < 32)) {
          throw new Error('JWT_SECRET must be set to at least 32 characters in production');
        }
        const expiresIn = config.get<string>('JWT_EXPIRES_IN') || '1h';
        return {
          secret: jwtSecret || 'sophia-central-dev-secret',
          signOptions: {
            expiresIn: expiresIn as NonNullable<JwtModuleOptions['signOptions']>['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PasswordResetEmailService],
  exports: [AuthService],
})
export class AuthModule {}
