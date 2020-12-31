import {
  FindManyOptions, getRepository, ILike, Repository,
} from 'typeorm';
import { ListParams } from '../controllers/ListParams';
import { Contract } from '../entity/Contract';
import { User } from '../entity/User';
import { ApiError, HTTPStatus } from '../helpers/error';
import { ContractActivity, ContractStatus } from '../entity/activity/ContractActivity';
import ActivityService, { FullActivityParams } from './ActivityService';
import { ActivityType } from '../entity/activity/BaseActivity';

export interface ContractParams {
  title: string;
  companyId: number;
  contactId: number;
  comments?: string;
  assignedToId?: number;
}

export interface ContractSummary {
  id: number;
  title: string;
}

export interface ContractListResponse {
  list: Contract[];
  count: number;
}

export default class ContractService {
  repo: Repository<Contract>;

  /** Represents the logged in user, performing an operation */
  actor?: User;

  constructor(options?: { actor?: User }) {
    this.repo = getRepository(Contract);
    this.actor = options?.actor;
  }

  async getContract(id: number, relations: string[] = []): Promise<Contract> {
    const contract = await this.repo.findOne(id, {
      relations: ['contact', 'company', 'products', 'activities', 'products.activities', 'products.invoice', 'files', 'files.createdBy'].concat(relations),
    }); // May need more relations
    if (contract === undefined) {
      throw new ApiError(HTTPStatus.NotFound, 'Contract not found');
    }
    return contract;
  }

  async getAllContracts(params: ListParams): Promise<ContractListResponse> {
    const findOptions: FindManyOptions<Contract> = {
      order: {
        [params.sorting?.column ?? 'id']:
        params.sorting?.direction ?? 'ASC',
      },
    };

    if (params.search !== undefined && params.search.trim() !== '') {
      findOptions.where = [
        { title: ILike(`%${params.search.trim()}%`) },
        { poNumber: ILike(`%${params.search.trim()}%`) },
        /* To add: ID */
      ];
    }

    return {
      list: await this.repo.find({
        ...findOptions,
        skip: params.skip,
        take: params.take,
      }),
      count: await this.repo.count(findOptions),
    };
  }

  async getContractSummaries(): Promise<ContractSummary[]> {
    return this.repo.find({ select: ['id', 'title'] });
  }

  async createContract(params: ContractParams): Promise<Contract> {
    console.log(this.actor);
    let contract = this.repo.create({
      ...params,
      createdById: this.actor?.id,
    });
    contract = await this.repo.save(contract);

    await new ActivityService(ContractActivity, { actor: this.actor }).createActivity({
      entityId: contract.id,
      type: ActivityType.STATUS,
      subType: ContractStatus.CREATED,
      description: '',
    } as FullActivityParams);

    return this.getContract(contract.id);
  }

  async updateContract(id: number, params: Partial<ContractParams>): Promise<Contract> {
    await this.repo.update(id, params);
    const contract = await this.repo.findOne(id);
    return contract!;
  }
}
