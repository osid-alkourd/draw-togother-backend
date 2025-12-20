import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  HttpStatus,
  HttpCode,
  ValidationPipe,
  UseGuards,
  UseFilters,
  ConflictException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { ValidationExceptionFilter } from '../common/filters/validation-exception.filter';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new user
   * Creates a user account and sets an HttpOnly cookie with JWT token
   * @param registerDto - Registration data (email, password, fullName)
   * @param res - Express response object
   * @returns Created user information (without sensitive data)
   */
  @Post('register')
  @UseFilters(ValidationExceptionFilter)
  async register(
    @Body(ValidationPipe) registerDto: RegisterDto,
    @Res() res: Response,
  ) {
    try {
      // Create user account
      const user = await this.authService.register(
        registerDto.email,
        registerDto.password,
        registerDto.fullName,
      );

      // Generate JWT token
      const token = this.authService.generateToken(user);

      // Set HttpOnly cookie (not accessible by JavaScript for security)
      const cookieOptions = {
        httpOnly: true, // Prevents JavaScript access
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'strict' as const, // CSRF protection
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/', // Cookie available for all paths
      };

      res.cookie('token', token, cookieOptions);

      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        return res.status(HttpStatus.CONFLICT).json({
          success: false,
          message: error.message || 'User with this email already exists',
        });
      }

      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Registration failed',
        error: error.message,
      });
    }
  }

  /**
   * Login user
   * Authenticates user credentials and sets an HttpOnly cookie with JWT token
   * @param loginDto - Login credentials (email, password)
   * @param res - Express response object
   * @returns Authenticated user information (without sensitive data)
   */
  @Post('login')
  @UseFilters(ValidationExceptionFilter)
  async login(
    @Body(ValidationPipe) loginDto: LoginDto,
    @Res() res: Response,
  ) {
    try {
      // Authenticate user credentials
      const user = await this.authService.login(
        loginDto.email,
        loginDto.password,
      );

      // Generate JWT token
      const token = this.authService.generateToken(user);

      // Set HttpOnly cookie (not accessible by JavaScript for security)
      const cookieOptions = {
        httpOnly: true, // Prevents JavaScript access
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'strict' as const, // CSRF protection
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/', // Cookie available for all paths
      };

      res.cookie('token', token, cookieOptions);

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    } catch (error) {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        success: false,
        message: error.message || 'Login failed',
      });
    }
  }

  /**
   * Get current authenticated user
   * Returns the user information for the authenticated user
   * Requires authentication
   * @param user - Current authenticated user (from JWT token)
   * @returns User information
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@CurrentUser() user: User) {
    return {
      success: true,
      message: 'User retrieved successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  /**
   * Logout user
   * Clears the HttpOnly authentication cookie
   * Requires authentication
   * @param res - Express response object
   * @returns Success message with success status
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Res() res: Response) {
    try {
      // Clear the authentication cookie by setting it with expired date
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict' as const,
        path: '/',
        expires: new Date(0), // Expire immediately
      };

      res.clearCookie('token', cookieOptions);

      return res.status(HttpStatus.OK).json({
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Logout successful',
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to logout',
        error: error.message,
        data: null,
      });
    }
  }
}

