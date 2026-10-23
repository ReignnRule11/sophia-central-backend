import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';

function extractCookieToken(req: { headers?: { cookie?: string } }): string | null {
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return null;
  const token = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('sophia_access_token='))
    ?.slice('sophia_access_token='.length);
  return token ? decodeURIComponent(token) : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly usersService: UsersService,
    config: ConfigService,
  ) {
    const isProduction = config.get<string>('NODE_ENV') === 'production';
    const jwtSecret = config.get<string>('JWT_SECRET');
    if (isProduction && (!jwtSecret || jwtSecret.length < 32)) {
      throw new Error('JWT_SECRET must be set to at least 32 characters in production');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request) => ExtractJwt.fromAuthHeaderAsBearerToken()(request) || extractCookieToken(request),
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret || 'sophia-central-dev-secret',
      algorithms: ['HS256'],
    });
  }

  async validate(payload: { sub?: string }) {
    if (!payload?.sub) return null;
    return (await this.usersService.findOne(payload.sub)) || null;
  }
}
