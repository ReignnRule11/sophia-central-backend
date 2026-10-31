import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { UploadService } from './upload.service';
import { CreateFileUploadDto } from './dto/create-file-upload.dto';
import { CompleteFileUploadDto, CompleteProfileImageUploadDto } from './dto/complete-file-upload.dto';
import { CreateProfileImageUploadDto } from './dto/create-profile-image-upload.dto';

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('support-attachment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT, UserRole.LECTURER)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an image attachment for a support request' })
  async uploadSupportAttachment(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploadService.uploadSupportAttachment(user.id, file);
  }

  @Post('presigned-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get presigned URL for S3 upload' })
  async getPresignedUrl(
    @CurrentUser() user: User,
    @Body() dto: CreateFileUploadDto,
  ) {
    return this.uploadService.getPresignedUrl(user.id, dto);
  }

  @Post('complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete upload and create file record' })
  async completeUpload(
    @CurrentUser() user: User,
    @Body() dto: CompleteFileUploadDto,
  ) {
    return this.uploadService.completeUpload(user.id, dto);
  }

  @Post('profile-image/presigned-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a presigned URL for the current user profile image' })
  async getProfileImagePresignedUrl(
    @CurrentUser() user: User,
    @Body() dto: CreateProfileImageUploadDto,
  ) {
    return this.uploadService.getProfileImagePresignedUrl(user.id, dto);
  }

  @Post('profile-image/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete and save the current user profile image upload' })
  async completeProfileImageUpload(
    @CurrentUser() user: User,
    @Body() dto: CompleteProfileImageUploadDto,
  ) {
    return this.uploadService.completeProfileImageUpload(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get upload details' })
  async getUploadDetails(@Param('id') id: string) {
    return this.uploadService.getUploadDetails(id);
  }
}
