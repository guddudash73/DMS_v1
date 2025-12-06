import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Billing, BillingCheckoutInput, Visit, VisitId } from '@dms/types';
import { visitRepository } from './visitRepository';
import { patientRepository } from './patientRepository';
import { followupRepository, FollowUpRuleViolationError } from './followupRepository';
import { logInfo, logError } from '../lib/logger';
import { dynamoClient, TABLE_NAME } from '../config/aws';

export class BillingRuleViolationError extends Error {
  readonly code = 'BILLING_RULE_VIOLATION' as const;
  readonly statusCode = 400 as const;

  constructor(message: string) {
    super(message);
    this.name = 'BillingRuleViolationError';
  }
}

export class DuplicateCheckoutError extends Error {
  readonly code = 'DUPLICATE_CHECKOUT' as const;
  readonly statusCode = 409 as const;

  constructor(message: string) {
    super(message);
    this.name = 'DuplicateCheckoutError';
  }
}

export class VisitNotDoneError extends Error {
  readonly code = 'VISIT_NOT_DONE' as const;
  readonly statusCode = 409 as const;

  constructor(message: string) {
    super(message);
    this.name = 'VisitNotDoneError';
  }
}

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const buildVisitMetaKey = (visitId: string) => ({
  PK: `VISIT#${visitId}`,
  SK: 'META',
});

const buildPatientVisitKey = (patientId: string, visitId: string) => ({
  PK: `PATIENT#${patientId}`,
  SK: `VISIT#${visitId}`,
});

const buildBillingKey = (visitId: string) => ({
  PK: `VISIT#${visitId}`,
  SK: 'BILLING',
});

const buildFollowUpKey = (visitId: string) => ({
  PK: `VISIT#${visitId}`,
  SK: 'FOLLOWUP',
});

const todayDateString = (): string => new Date().toISOString().slice(0, 10);

interface ComputedBillingTotals {
  billing: Billing;
  total: number;
}

const computeTotals = (visitId: VisitId, input: BillingCheckoutInput): ComputedBillingTotals => {
  const now = Date.now();

  const items = input.items.map((item) => {
    const lineTotal = item.quantity * item.unitAmount;
    if (lineTotal < 0) {
      throw new BillingRuleViolationError('Line total must be non-negative');
    }
    return { ...item, lineTotal };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discountAmount = input.discountAmount ?? 0;
  const taxAmount = input.taxAmount ?? 0;

  if (discountAmount > subtotal) {
    throw new BillingRuleViolationError('Discount cannot exceed subtotal');
  }

  const total = subtotal - discountAmount + taxAmount;
  if (total < 0) {
    throw new BillingRuleViolationError('Net payable total cannot be negative');
  }

  const billing: Billing = {
    visitId,
    items,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    currency: 'INR',
    createdAt: now,
  };

  return { billing, total };
};

type TransactItem =
  | {
      Update: {
        TableName: string;
        Key: Record<string, unknown>;
        UpdateExpression: string;
        ExpressionAttributeNames?: Record<string, string>;
        ExpressionAttributeValues?: Record<string, unknown>;
        ConditionExpression?: string;
      };
      Put?: never;
    }
  | {
      Put: {
        TableName: string;
        Item: Record<string, unknown>;
        ConditionExpression?: string;
      };
      Update?: never;
    };

export interface BillingRepository {
  checkout(visitId: VisitId, input: BillingCheckoutInput): Promise<Billing>;
  getByVisitId(visitId: VisitId): Promise<Billing | null>;
}

export class DynamoDBBillingRepository implements BillingRepository {
  async checkout(visitId: VisitId, input: BillingCheckoutInput): Promise<Billing> {
    const visit = await visitRepository.getById(visitId);
    if (!visit) {
      throw new BillingRuleViolationError('Visit not found for checkout');
    }

    if (visit.status !== 'DONE') {
      throw new VisitNotDoneError('Checkout is only allowed when visit status is DONE');
    }

    const patient = await patientRepository.getById(visit.patientId);
    if (!patient) {
      throw new BillingRuleViolationError('Cannot checkout visit for deleted or missing patient');
    }

    const existingBill = await this.getByVisitId(visitId);
    if (existingBill) {
      throw new DuplicateCheckoutError('Billing already exists for this visit');
    }

    const existingFollowup = await followupRepository.getByVisitId(visitId);

    if (input.followUp && existingFollowup) {
      throw new FollowUpRuleViolationError('Follow-up already exists for this visit');
    }

    const { billing, total } = computeTotals(visitId, input);
    const now = billing.createdAt;

    let followUpItem: TransactItem | undefined;

    if (input.followUp) {
      const { followUpDate, reason, contactMethod } = input.followUp;

      const visitDate = visit.visitDate;
      const today = todayDateString();

      if (followUpDate < visitDate) {
        throw new FollowUpRuleViolationError(
          `followUpDate ${followUpDate} cannot be before visitDate ${visitDate}`,
        );
      }

      if (followUpDate < today) {
        throw new FollowUpRuleViolationError(
          `followUpDate ${followUpDate} cannot be in the past relative to today ${today}`,
        );
      }

      const effectiveContactMethod = contactMethod ?? existingFollowup?.contactMethod ?? 'CALL';

      followUpItem = {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            ...buildFollowUpKey(visitId),
            entityType: 'FOLLOWUP',
            visitId,
            followUpDate,
            reason,
            contactMethod: effectiveContactMethod,
            status: 'ACTIVE',
            createdAt: existingFollowup?.createdAt ?? now,
            updatedAt: now,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      };
    }

    const transactItems: TransactItem[] = [
      {
        Update: {
          TableName: TABLE_NAME,
          Key: buildVisitMetaKey(visitId),
          UpdateExpression: 'SET #billingAmount = :billingAmount, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#billingAmount': 'billingAmount',
            '#updatedAt': 'updatedAt',
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':billingAmount': total,
            ':updatedAt': now,
            ':done': 'DONE',
          },
          ConditionExpression:
            'attribute_exists(PK) AND #status = :done AND attribute_not_exists(#billingAmount)',
        },
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: buildPatientVisitKey(visit.patientId, visit.visitId),
          UpdateExpression: 'SET #billingAmount = :billingAmount, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#billingAmount': 'billingAmount',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':billingAmount': total,
            ':updatedAt': now,
          },
          ConditionExpression: 'attribute_exists(PK)',
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            ...buildBillingKey(visitId),
            entityType: 'BILLING',
            ...billing,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ];

    if (followUpItem) {
      transactItems.push(followUpItem);
    }

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: transactItems,
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error during billing checkout';

      logError('billing_checkout_failed', {
        visitId,
        error: message,
      });

      throw new DuplicateCheckoutError(
        'Billing already exists or visit state changed during checkout',
      );
    }

    logInfo('billing_checkout_success', {
      visitId,
      patientId: visit.patientId,
      total,
    });

    return billing;
  }

  async getByVisitId(visitId: VisitId): Promise<Billing | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildBillingKey(visitId),
        ConsistentRead: true,
      }),
    );

    if (!Item || Item.entityType !== 'BILLING') {
      return null;
    }

    const visit = (await visitRepository.getById(visitId)) as Visit | null;
    if (!visit) {
      return null;
    }

    const patient = await patientRepository.getById(visit.patientId);
    if (!patient) {
      return null;
    }

    return Item as Billing;
  }
}

export const billingRepository: BillingRepository = new DynamoDBBillingRepository();
