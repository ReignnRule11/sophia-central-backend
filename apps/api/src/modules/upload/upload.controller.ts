import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { S3Service } from '../../../../libs/storage/src/s3.service';

class UploadRequestDto {
  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;
}

@Controller('v1/resources')
export class UploadController {
  private s3: S3Service;

  constructor() {
    // In real app, inject via NestJS config/service container
    this.s3 = new S3Service(process.env.AWS_REGION || 'us-east-1', process.env.S3_BUCKET || 'sophia-dev-bucket');
  }

  @Post(':id/upload-request')
  async requestUpload(@Param('id') resourceId: string, @Body() body: UploadRequestDto, @Req() req: any) {
    // Basic validation
    if (!this.s3.validateUploadFilename(body.filename)) {
      return { error: 'unsupported file type' };
    }

    const key = `resources/${resourceId}/${Date.now()}-${body.filename}`;
    const url = await this.s3.generatePresignedUploadUrl({ key, contentType: body.contentType });

    // Store a pending file record in DB in real implementation
    return { uploadUrl: url, key };
  }
}
