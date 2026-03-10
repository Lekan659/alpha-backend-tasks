import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    const { method, url, body } = request;
    const userId = (request as any).user?.userId || 'anonymous';
    const workspaceId = (request as any).user?.workspaceId || 'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';
    const requestId = this.generateRequestId();
    
    const startTime = Date.now();

    // Attach request ID to request object for tracing
    (request as any).requestId = requestId;

    this.logger.log(
      `[${requestId}] --> ${method} ${url} | user=${userId} workspace=${workspaceId}`,
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;
          
          this.logger.log(
            `[${requestId}] <-- ${method} ${url} ${statusCode} | ${duration}ms`,
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;
          
          this.logger.warn(
            `[${requestId}] <-- ${method} ${url} ${statusCode} | ${duration}ms | ${error.message}`,
          );
        },
      }),
    );
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
