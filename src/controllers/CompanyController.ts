import {
  Body,
  Tags, Controller, Post, Route, Put, Get, Query, Security, Response, Delete, Request,
} from 'tsoa';
import express from 'express';
import { body } from 'express-validator';
import { Company, CompanyStatus } from '../entity/Company';
import { Invoice } from '../entity/Invoice';
import { Contact } from '../entity/Contact';
import { WrappedApiError } from '../helpers/error';
import CompanyService, { CompanyListResponse, CompanyParams, CompanySummary } from '../services/CompanyService';
import { ListParams } from './ListParams';
import ActivityService, {
  ActivityParams,
  FullActivityParams,
} from '../services/ActivityService';
import BaseActivity, { ActivityType } from '../entity/activity/BaseActivity';
import { CompanyActivity } from '../entity/activity/CompanyActivity';
import { User } from '../entity/User';
import { validate, validateActivityParams } from '../helpers/validation';

@Route('company')
@Tags('Company')
export class CompanyController extends Controller {
  private async validateCompanyParams(req: express.Request): Promise<void> {
    await validate([
      body('name').notEmpty().trim(),
      body('description').optional().notEmpty().trim(),
      body('phoneNumber').optional().isMobilePhone('any').trim(),
      body('addressStreet').notEmpty().trim(),
      body('addressPostalCode').notEmpty().trim(),
      body('addressCity').notEmpty().trim(),
      body('addressCountry').notEmpty().trim(),
      body('invoiceAddressStreet').optional().notEmpty().trim(),
      body('invoiceAddressPostalCode').optional().notEmpty().trim(),
      body('invoiceAddressCity').optional().notEmpty().trim(),
      body('invoiceAddressCountry').optional().notEmpty().trim(),
      body('status').optional().isIn(Object.values(CompanyStatus)),
      body('endDate').optional()
    ], req);
  }

  /**
   * getAllCompanies() - retrieve multiple companies
   * @param lp List parameters to sort and filter the list
   */
  @Post('table')
  @Security('local', ['GENERAL', 'ADMIN', 'AUDIT'])
  @Response<WrappedApiError>(401)
  public async getAllCompanies(
    @Body() lp: ListParams,
  ): Promise<CompanyListResponse> {
    return new CompanyService().getAllCompanies(lp);
  }

  /**
   * getCompanySummaries() - retrieve a list of all companies
   * as compact as possible. Used for display of references and options
   */
  @Get('compact')
  @Security('local', ['SIGNEE', 'FINANCIAL', 'GENERAL', 'ADMIN', 'AUDIT'])
  @Response<WrappedApiError>(401)
  public async getCompanySummaries(): Promise<CompanySummary[]> {
    return new CompanyService().getCompanySummaries();
  }

  /**
   * getCompany() - retrieve single company
   * @param id ID of company to retrieve
   */
  @Get('{id}')
  @Security('local', ['GENERAL', 'ADMIN', 'AUDIT'])
  @Response<WrappedApiError>(401)
  public async getCompany(id: number): Promise<Company> {
    return new CompanyService().getCompany(id);
  }

  /**
   * createCompany() - create company
   * @param params Parameters to create company with
   * @param req Express.js request object
   */
  @Post()
  @Security('local', ['ADMIN'])
  @Response<WrappedApiError>(401)
  public async createCompany(
    @Body() params: CompanyParams, @Request() req: express.Request,
  ): Promise<Company> {
    await this.validateCompanyParams(req);
    return new CompanyService().createCompany(params);
  }

  /**
   * updateCompany() - update company
   * @param id ID of company to update
   * @param params Update subset of parameter of company
   * @param req Express.js request object
   */
  @Put('{id}')
  @Security('local', ['GENERAL', 'ADMIN'])
  @Response<WrappedApiError>(401)
  public async updateCompany(
    id: number, @Body() params: Partial<CompanyParams>, @Request() req: express.Request,
  ): Promise<Company> {
    await this.validateCompanyParams(req);
    return new CompanyService().updateCompany(id, params);
  }

  /**
   * getUnresolvedInvoices() - retrieve unresolved invoices from company
   * @param id ID of company to retrieve unresolved invoices for
   */
  @Get('{id}/invoices')
  @Security('local', ['GENERAL', 'ADMIN', 'AUDIT'])
  @Response<WrappedApiError>(401)
  public async getUnresolvedInvoices(id: number): Promise<Invoice[]> {
    return new CompanyService().getUnresolvedInvoices(id);
  }

  /**
   * getContacts() - retrieve contacts from company
   * @param id ID of company to retrieve unresolved invoices for
   */
  @Get('{id}/contacts')
  @Security('local', ['GENERAL', 'ADMIN', 'AUDIT'])
  @Response<WrappedApiError>(401)
  public async getContacts(id: number): Promise<Contact[]> {
    return new CompanyService().getContacts(id);
  }

  /**
   * Add a activity comment to this company
   * @param id ID of the company
   * @param params Parameters to create this comment with
   * @param req Express.js request object
   */
  @Post('{id}/comment')
  @Security('local', ['GENERAL', 'ADMIN'])
  @Response<WrappedApiError>(401)
  public async addComment(
    id: number, @Body() params: ActivityParams, @Request() req: express.Request,
  ): Promise<BaseActivity> {
    await validateActivityParams(req);
    const p = {
      ...params,
      entityId: id,
      type: ActivityType.COMMENT,
    } as FullActivityParams;
    return new ActivityService(CompanyActivity, { actor: req.user as User })
      .createActivity(p);
  }

  /**
   * @param id ID of the company
   * @param activityId ID of the comment activity
   * @param params Update subset of parameter of comment activity
   * @param req Express.js request object
   */
  @Put('{id}/activity/{activityId}')
  @Security('local', ['GENERAL', 'ADMIN'])
  @Response<WrappedApiError>(401)
  public async updateActivity(
    id: number, activityId: number, @Body() params: Partial<ActivityParams>,
    @Request() req: express.Request,
  ): Promise<BaseActivity> {
    await validateActivityParams(req);
    return new ActivityService(CompanyActivity).updateActivity(id, activityId, params);
  }

  /**
   * @param id ID of the company
   * @param activityId ID of the comment activity
   */
  @Delete('{id}/activity/{activityId}')
  @Security('local', ['GENERAL', 'ADMIN'])
  @Response<WrappedApiError>(401)
  public async deleteActivity(id: number, activityId: number): Promise<void> {
    return new ActivityService(CompanyActivity).deleteActivity(id, activityId);
  }
}
