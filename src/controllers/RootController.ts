import express from 'express';
import {
  Body,
  Controller, Get, Post, Query, Request, Response, Route, Security,

} from 'tsoa';
import { body } from 'express-validator';
import { User } from '../entity/User';
import { WrappedApiError } from '../helpers/error';
import { validate } from '../helpers/validation';
import AuthService, { AuthStatus } from '../services/AuthService';
import ServerSettingsService, { SetupParams } from '../services/ServerSettingsService';

export interface ResetPasswordRequest {
  password: string;
  repeatPassword: string;
  token: string;
}

@Route('')
export class RootController extends Controller {
  @Post('setup')
  public async postSetup(@Body() params: SetupParams): Promise<void> {
    return new ServerSettingsService().initialSetup(params);
  }

  @Get('authStatus')
  public async getAuthStatus(@Request() req: express.Request): Promise<AuthStatus> {
    return new AuthService().getAuthStatus(req);
  }

  @Get('profile')
  @Security('local')
  @Response<WrappedApiError>(401)
  public async getProfile(@Request() req: express.Request): Promise<User> {
    return new AuthService().getProfile(req);
  }

  @Post('logout')
  public async logout(@Request() req: express.Request): Promise<void> {
    return new AuthService().logout(req);
  }

  @Post('forgotPassword')
  public async forgotPassword(@Query() email: string): Promise<void> {
    return new AuthService().forgotPassword(email);
  }

  @Post('resetPassword')
  @Response<WrappedApiError>(400)
  public async resetPassword(
    @Request() req: express.Request,
      @Body() reqBody: ResetPasswordRequest,
  ): Promise<void> {
    await validate([
      body('password').equals(reqBody.repeatPassword),
      body('password').isStrongPassword(),
    ], req);
    return new AuthService().resetPassword(reqBody.password, reqBody.token);
  }
}
