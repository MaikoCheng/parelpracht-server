import {
  FindManyOptions, getRepository, IsNull, Not, Repository,
} from 'typeorm';
import { ProductInstance } from '../entity/ProductInstance';
import { ApiError, HTTPStatus } from '../helpers/error';
// eslint-disable-next-line import/no-cycle
import InvoiceService from './InvoiceService';
// eslint-disable-next-line import/no-cycle
import ActivityService, { FullActivityParams } from './ActivityService';
import { ProductInstanceActivity } from '../entity/activity/ProductInstanceActivity';
import { User } from '../entity/User';
import { ContractActivity } from '../entity/activity/ContractActivity';
import { InvoiceActivity } from '../entity/activity/InvoiceActivity';
import ProductService from './ProductService';
import { ProductStatus } from '../entity/enums/ProductStatus';
import { ContractStatus } from '../entity/enums/ContractStatus';
import { ActivityType } from '../entity/enums/ActivityType';
import { ProductInstanceStatus } from '../entity/enums/ProductActivityStatus';
import { InvoiceStatus } from '../entity/enums/InvoiceStatus';
import {
  createActivitiesForEntityEdits,
  createDelProductActivityDescription,
} from '../helpers/activity';

export interface ProductInstanceParams {
  productId: number,
  basePrice: number,
  discount?: number,
  comments?: string;
}

export interface ProductInstanceListResponse {
  list: ProductInstance[],
  count: number,
}

export default class ProductInstanceService {
  repo: Repository<ProductInstance>;

  actor?: User;

  constructor(options?: {actor?: User}) {
    this.repo = getRepository(ProductInstance);
    this.actor = options?.actor;
  }

  validateProductInstanceContract(
    productInstance: ProductInstance | undefined, contractId: number,
  ): ProductInstance {
    if (productInstance === undefined) {
      throw new ApiError(HTTPStatus.NotFound, 'ProductInstance not found');
    }
    if (productInstance.contractId !== contractId) {
      throw new ApiError(HTTPStatus.BadRequest, 'ProductInstance does not belong to this product');
    }
    return productInstance;
  }

  async validateProductInstanceContractB(
    contractId: number, productInstanceId: number,
  ): Promise<void> {
    const productInstance = await this.repo.findOne(productInstanceId);
    this.validateProductInstanceContract(productInstance, contractId);
  }

  async addProduct(contractId: number, params: ProductInstanceParams): Promise<ProductInstance> {
    const product = await new ProductService().getProduct(params.productId);
    let productInstance = {
      ...params,
      contractId,
    } as any as ProductInstance;

    if (product.status === ProductStatus.INACTIVE) {
      throw new ApiError(HTTPStatus.BadRequest, 'Cannot add inactive products to contracts');
    }

    const statuses = await new ActivityService(ContractActivity).getStatuses({ contractId });
    if (statuses.includes(ContractStatus.CONFIRMED) || statuses.includes(ContractStatus.FINISHED)
      || statuses.includes(ContractStatus.CANCELLED)) {
      throw new ApiError(HTTPStatus.BadRequest, 'Cannot add product to this contract, because the contract is already confirmed, finished or delivered');
    }

    productInstance = await this.repo.save(productInstance);

    // Create two activities:
    await Promise.all([
      // An activity that states that this productInstance has been created
      new ActivityService(ProductInstanceActivity, { actor: this.actor }).createActivity({
        entityId: productInstance.id,
        type: ActivityType.STATUS,
        subType: ProductInstanceStatus.NOTDELIVERED,
        description: '',
      } as FullActivityParams),
      // An activity that states that this product has been added to the contract
      new ActivityService(ContractActivity, { actor: this.actor })
        .createProductActivity(product.nameEnglish, contractId),
    ]);

    productInstance = (await this.repo.findOne(productInstance.id, { relations: ['activities'] }))!;
    return productInstance;

    // TODO: Fix that the contract is also passed on with the product
  }

  async getProduct(id: number, relations: string[] = []): Promise<ProductInstance> {
    const product = await this.repo.findOne(id, { relations }); // Relations still have to be added
    if (product === undefined) {
      throw new ApiError(HTTPStatus.NotFound, 'ProductInstance not found');
    }
    return product;
  }

  async getProductContracts(id: number, skip?: number, take?: number):
  Promise<ProductInstanceListResponse> {
    const findOptions: FindManyOptions<ProductInstance> = {
      relations: ['contract'],
      where: {
        productId: id,
      },
    };

    return {
      list: await this.repo.find({
        ...findOptions,
        take,
        skip,
      }),
      count: await this.repo.count(findOptions),
    };
  }

  async getProductInvoices(id: number, skip?: number, take?: number):
  Promise<ProductInstanceListResponse> {
    const findOptions: FindManyOptions<ProductInstance> = {
      relations: ['invoice'],
      where: {
        productId: id,
        invoiceId: Not(IsNull()),
      },
    };

    return {
      list: await this.repo.find({
        ...findOptions,
        take,
        skip,
      }),
      count: await this.repo.count(findOptions),
    };
  }

  async updateProduct(
    contractId: number, productInstanceId: number, params: Partial<ProductInstance>,
  ): Promise<ProductInstance> {
    let productInstance = await this.repo.findOne(productInstanceId);
    productInstance = this.validateProductInstanceContract(productInstance, contractId);

    if (!(await createActivitiesForEntityEdits<ProductInstance>(
      this.repo, productInstance, params,
      new ActivityService(ProductInstanceActivity, { actor: this.actor }),
    ))) return productInstance;

    productInstance = await this.repo.findOne(productInstanceId)!;
    return productInstance!;
  }

  async deleteProduct(contractId: number, productInstanceId: number): Promise<void> {
    let productInstance = await this.getProduct(productInstanceId, ['activities', 'product']);
    productInstance = this.validateProductInstanceContract(productInstance, contractId);

    if (productInstance.activities.filter((a) => a.type === ActivityType.STATUS).length > 1) {
      throw new ApiError(HTTPStatus.BadRequest, 'Product instance has a different status than CREATED');
    }
    if (productInstance.invoiceId !== null) {
      throw new ApiError(HTTPStatus.BadRequest, 'Product instance is already invoiced');
    }

    await this.repo.delete(productInstance.id);

    await new ActivityService(ContractActivity, { actor: this.actor })
      .createActivity({
        description: createDelProductActivityDescription([productInstance.product.nameEnglish]),
        entityId: productInstance.contractId,
        type: ActivityType.DELPRODUCT,
      });
  }

  async addInvoiceProduct(invoiceId: number, productId: number): Promise<ProductInstance> {
    const productInstance = await this.getProduct(productId, ['contract']);
    const invoice = await new InvoiceService().getInvoice(invoiceId);
    // Verify that this productInstance doesn't already belong to an invoice
    if (productInstance.invoiceId !== null) {
      throw new ApiError(HTTPStatus.BadRequest, 'ProductInstance already belongs to an invoice');
    }
    // Verify that the product instance and the invoice share the same company
    if (invoice.companyId !== productInstance.contract.companyId) {
      throw new ApiError(HTTPStatus.BadRequest, 'ProductInstance does not belong to the same company as the invoice');
    }

    const statuses = await new ActivityService(InvoiceActivity).getStatuses({ invoiceId });
    if (statuses.includes(InvoiceStatus.CANCELLED) || statuses.includes(InvoiceStatus.PAID)
      || statuses.includes(InvoiceStatus.SENT) || statuses.includes(InvoiceStatus.IRRECOVERABLE)) {
      throw new ApiError(HTTPStatus.BadRequest, 'Cannot add product to this invoice, because the invoice is already sent or finished');
    }

    productInstance.invoiceId = invoiceId;
    return this.repo.save(productInstance);
  }

  async deleteInvoiceProduct(invoiceId: number, productId: number): Promise<void> {
    const instance = await this.getProduct(productId);
    if (instance.invoiceId !== invoiceId) {
      throw new ApiError(HTTPStatus.BadRequest, 'ProductInstance does not belong to this invoice');
    }

    await this.repo.update(instance.id, { invoiceId: undefined });
  }
}
