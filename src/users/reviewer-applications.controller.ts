import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, UserRole } from './entities/user.entity';
import { ReviewerApplicationsService } from './reviewer-applications.service';
import { SubmitReviewerApplicationDto } from './dto/submit-reviewer-application.dto';
import { ReviewerApplicationDecisionDto } from './dto/reviewer-application-decision.dto';

type AuthenticatedRequest = Request & { user: User };

@ApiTags('Academic Reviewer Applications')
@ApiBearerAuth()
@Controller('reviewer-applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReviewerApplicationsController {
  constructor(private readonly applications: ReviewerApplicationsService) {}

  @Post()
  @UseGuards(CsrfGuard)
  @Roles(UserRole.LECTURER, UserRole.REVIEWER)
  submit(@Req() req: AuthenticatedRequest, @Body() dto: SubmitReviewerApplicationDto) {
    return this.applications.submit(req.user, dto);
  }

  @Get('me')
  @Roles(UserRole.LECTURER, UserRole.REVIEWER)
  mine(@Req() req: AuthenticatedRequest) {
    return this.applications.mine(req.user);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  list(@Query('status') status: string | undefined, @Req() req: AuthenticatedRequest) {
    return this.applications.listForAdmin(status, req.user);
  }

  @Get(':id/decisions')
  @Roles(UserRole.ADMIN)
  decisionHistory(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.applications.decisionHistory(id, req.user);
  }

  @Patch(':id/decision')
  @UseGuards(CsrfGuard)
  @Roles(UserRole.ADMIN)
  decide(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Body() dto: ReviewerApplicationDecisionDto) {
    return this.applications.decide(id, req.user, dto);
  }
}
