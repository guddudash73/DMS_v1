// apps/api/src/repositories/billingRepository.ts
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Billing, BillingCheckoutInput, Visit, VisitId } from '@dcm/types';
import { visitRepository } from './visitRepository';
import { patientRepository } from './patientRepository';
import { FollowUpRuleViolationError } from './followupRepository';
import { logInfo, logError } from '../lib/logger';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import { v4 as randomUUID } from 'uuid';
import { isoDateInTimeZone } from '../lib/date';

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

const buildFollowUpKey = (visitId: string, followupId: string) => ({
  PK: `VISIT#${visitId}`,
  SK: `FOLLOWUP#${followupId}`,
});

/* ------------------------- Bill number counter (daily) ------------------------- */

const buildBillDailyCounterKey = (visitDate: string) => ({
  PK: `COUNTER#BILL#${visitDate}`,
  SK: 'META',
});

async function nextBillCounter(visitDate: string): Promise<number> {
  const { Attributes } = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: buildBillDailyCounterKey(visitDate),
      UpdateExpression: 'ADD #last :inc SET #updatedAt = :now',
      ExpressionAttributeNames: { '#last': 'last', '#updatedAt': 'updatedAt' },
      ExpressionAttributeValues: { ':inc': 1, ':now': Date.now() },
      ReturnValues: 'UPDATED_NEW',
    }),
  );

  return Number((Attributes?.last as number | undefined) ?? 0);
}

function formatBillNo(visitDate: string, seq: number) {
  const yy = visitDate.slice(2, 4);
  const mm = visitDate.slice(5, 7);
  const dd = visitDate.slice(8, 10);
  return `BL/${yy}/${mm}/${dd}/${String(seq).padStart(3, '0')}`;
}

/* -------------------------------- Followup GSI -------------------------------- */

const gsi3PK_date = (dateISO: string) => `DATE#${dateISO}`;
const gsi3SK_typeId = (type: 'FOLLOWUP', id: string) => `TYPE#${type}#ID#${id}`;

const todayDateString = (): string => isoDateInTimeZone(new Date(), 'Asia/Kolkata');

/* -------------------------------- Computations -------------------------------- */

interface ComputedBillingTotals {
  billing: Billing;
  total: number;
}

const computeTotals = (visitId: VisitId, input: BillingCheckoutInput): ComputedBillingTotals => {
  const now = Date.now();

  // ✅ enforce mutual exclusivity here too (in addition to zod)
  if (input.receivedOnline === true && input.receivedOffline === true) {
    throw new BillingRuleViolationError('Only one of receivedOnline/receivedOffline can be true');
  }

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
    // billNo is set by checkout/updateBill (not here)
    billNo: '',
    items,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    currency: 'INR',
    createdAt: now,

    ...(typeof input.receivedOnline === 'boolean' ? { receivedOnline: input.receivedOnline } : {}),
    ...(typeof input.receivedOffline === 'boolean'
      ? { receivedOffline: input.receivedOffline }
      : {}),
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
  updateBill(visitId: VisitId, input: BillingCheckoutInput): Promise<Billing>; // ✅ Option 2 admin edit
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

    // ✅ production-safe: treat deleted patient like missing
    if (!patient || patient.isDeleted) {
      throw new BillingRuleViolationError('Cannot checkout visit for deleted or missing patient');
    }

    const existingBill = await this.getByVisitId(visitId);
    if (existingBill) {
      throw new DuplicateCheckoutError('Billing already exists for this visit');
    }

    // ✅ Z rule: billing is disabled unless explicitly enabled
    if (visit.zeroBilled === true && input.allowZeroBilled !== true) {
      throw new BillingRuleViolationError(
        'Billing is disabled for zero-billed (Z) visits. Enable billing to proceed.',
      );
    }

    // ✅ Generate stable bill number once
    const billSeq = await nextBillCounter(visit.visitDate);
    const billNo = formatBillNo(visit.visitDate, billSeq);

    const { billing, total } = computeTotals(visitId, input);

    // ✅ Hard enforcement: for all zero-billed visits, total must be 0
    if (visit.zeroBilled === true && total > 0) {
      throw new BillingRuleViolationError('Zero-billed (Z) visits must have total = 0.');
    }

    const now = billing.createdAt;

    const billingWithNo: Billing = {
      ...billing,
      billNo,
      createdAt: now,
    };

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

      const followupId = randomUUID();
      const effectiveContactMethod = contactMethod ?? 'CALL';

      followUpItem = {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            ...buildFollowUpKey(visitId, followupId),
            entityType: 'FOLLOWUP',

            followupId,
            visitId,
            followUpDate,
            reason,
            contactMethod: effectiveContactMethod,
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,

            GSI3PK: gsi3PK_date(followUpDate),
            GSI3SK: gsi3SK_typeId('FOLLOWUP', followupId),
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      };
    }

    const receivedOnline =
      typeof input.receivedOnline === 'boolean' ? input.receivedOnline : undefined;
    const receivedOffline =
      typeof input.receivedOffline === 'boolean' ? input.receivedOffline : undefined;

    const transactItems: TransactItem[] = [
      {
        Update: {
          TableName: TABLE_NAME,
          Key: buildVisitMetaKey(visitId),
          UpdateExpression:
            'SET #billingAmount = :billingAmount, #billNo = :billNo, #updatedAt = :updatedAt, #checkedOut = :true, #checkedOutAt = :checkedOutAt' +
            (typeof receivedOnline === 'boolean' ? ', #receivedOnline = :receivedOnline' : '') +
            (typeof receivedOffline === 'boolean' ? ', #receivedOffline = :receivedOffline' : ''),
          ExpressionAttributeNames: {
            '#billingAmount': 'billingAmount',
            '#billNo': 'billNo',
            '#updatedAt': 'updatedAt',
            '#status': 'status',
            '#receivedOnline': 'receivedOnline',
            '#receivedOffline': 'receivedOffline',
            '#checkedOut': 'checkedOut',
            '#checkedOutAt': 'checkedOutAt',
          },
          ExpressionAttributeValues: {
            ':billingAmount': total,
            ':billNo': billNo,
            ':updatedAt': now,
            ':done': 'DONE',
            ':true': true,
            ':checkedOutAt': now,
            ...(typeof receivedOnline === 'boolean' ? { ':receivedOnline': receivedOnline } : {}),
            ...(typeof receivedOffline === 'boolean'
              ? { ':receivedOffline': receivedOffline }
              : {}),
          },
          ConditionExpression:
            'attribute_exists(PK) AND #status = :done AND attribute_not_exists(#billingAmount)',
        },
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: buildPatientVisitKey(visit.patientId, visit.visitId),
          UpdateExpression:
            'SET #billingAmount = :billingAmount, #billNo = :billNo, #updatedAt = :updatedAt, #checkedOut = :true, #checkedOutAt = :checkedOutAt' +
            (typeof receivedOnline === 'boolean' ? ', #receivedOnline = :receivedOnline' : '') +
            (typeof receivedOffline === 'boolean' ? ', #receivedOffline = :receivedOffline' : ''),
          ExpressionAttributeNames: {
            '#billingAmount': 'billingAmount',
            '#billNo': 'billNo',
            '#updatedAt': 'updatedAt',
            '#receivedOnline': 'receivedOnline',
            '#receivedOffline': 'receivedOffline',
            '#checkedOut': 'checkedOut',
            '#checkedOutAt': 'checkedOutAt',
          },
          ExpressionAttributeValues: {
            ':billingAmount': total,
            ':billNo': billNo,
            ':updatedAt': now,
            ':true': true,
            ':checkedOutAt': now,
            ...(typeof receivedOnline === 'boolean' ? { ':receivedOnline': receivedOnline } : {}),
            ...(typeof receivedOffline === 'boolean'
              ? { ':receivedOffline': receivedOffline }
              : {}),
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
            ...billingWithNo, // ✅ STORE billNo
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ];

    if (followUpItem) transactItems.push(followUpItem);

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
      billNo,
      receivedOnline: billingWithNo.receivedOnline ?? false,
      receivedOffline: billingWithNo.receivedOffline ?? false,
    });

    return billingWithNo; // ✅ return billNo
  }

  /**
   * ✅ Option 2:
   * Admin edits an existing bill:
   * - billNo stays the same (stable)
   * - totals/items can change
   * - visit.billingAmount updates accordingly
   */
  async updateBill(visitId: VisitId, input: BillingCheckoutInput): Promise<Billing> {
    const existingBill = await this.getByVisitId(visitId);
    if (!existingBill) {
      throw new BillingRuleViolationError('Billing not found');
    }

    const visit = await visitRepository.getById(visitId);
    if (!visit) {
      throw new BillingRuleViolationError('Visit not found');
    }

    if (visit.status !== 'DONE') {
      throw new VisitNotDoneError('Bill update is only allowed when visit status is DONE');
    }

    const patient = await patientRepository.getById(visit.patientId);
    if (!patient || patient.isDeleted) {
      throw new BillingRuleViolationError('Cannot update bill for deleted or missing patient');
    }

    // ✅ Z rule still applies
    if (visit.zeroBilled === true && input.allowZeroBilled !== true) {
      throw new BillingRuleViolationError(
        'Billing is disabled for zero-billed (Z) visits. Enable billing to proceed.',
      );
    }

    const { billing, total } = computeTotals(visitId, input);

    if (visit.zeroBilled === true && total > 0) {
      throw new BillingRuleViolationError('Zero-billed (Z) visits must have total = 0.');
    }

    const now = Date.now();

    const updatedBill: Billing = {
      ...billing,
      billNo: existingBill.billNo, // ✅ keep stable
      createdAt: existingBill.createdAt, // ✅ keep original time
    };

    const receivedOnline =
      typeof input.receivedOnline === 'boolean' ? input.receivedOnline : undefined;
    const receivedOffline =
      typeof input.receivedOffline === 'boolean' ? input.receivedOffline : undefined;

    // ✅ Replace BILLING item + update billingAmount on visit records
    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: TABLE_NAME,
                Item: {
                  ...buildBillingKey(visitId),
                  entityType: 'BILLING',
                  ...updatedBill,
                },
              },
            },
            {
              Update: {
                TableName: TABLE_NAME,
                Key: buildVisitMetaKey(visitId),
                UpdateExpression:
                  'SET #billingAmount = :billingAmount, #billNo = :billNo, #updatedAt = :updatedAt' +
                  (typeof receivedOnline === 'boolean'
                    ? ', #receivedOnline = :receivedOnline'
                    : '') +
                  (typeof receivedOffline === 'boolean'
                    ? ', #receivedOffline = :receivedOffline'
                    : ''),
                ExpressionAttributeNames: {
                  '#billingAmount': 'billingAmount',
                  '#billNo': 'billNo',
                  '#updatedAt': 'updatedAt',
                  '#receivedOnline': 'receivedOnline',
                  '#receivedOffline': 'receivedOffline',
                },
                ExpressionAttributeValues: {
                  ':billingAmount': total,
                  ':billNo': existingBill.billNo,
                  ':updatedAt': now,
                  ...(typeof receivedOnline === 'boolean'
                    ? { ':receivedOnline': receivedOnline }
                    : {}),
                  ...(typeof receivedOffline === 'boolean'
                    ? { ':receivedOffline': receivedOffline }
                    : {}),
                },
                ConditionExpression: 'attribute_exists(PK)',
              },
            },
            {
              Update: {
                TableName: TABLE_NAME,
                Key: buildPatientVisitKey(visit.patientId, visit.visitId),
                UpdateExpression:
                  'SET #billingAmount = :billingAmount, #billNo = :billNo, #updatedAt = :updatedAt' +
                  (typeof receivedOnline === 'boolean'
                    ? ', #receivedOnline = :receivedOnline'
                    : '') +
                  (typeof receivedOffline === 'boolean'
                    ? ', #receivedOffline = :receivedOffline'
                    : ''),
                ExpressionAttributeNames: {
                  '#billingAmount': 'billingAmount',
                  '#billNo': 'billNo',
                  '#updatedAt': 'updatedAt',
                  '#receivedOnline': 'receivedOnline',
                  '#receivedOffline': 'receivedOffline',
                },
                ExpressionAttributeValues: {
                  ':billingAmount': total,
                  ':billNo': existingBill.billNo,
                  ':updatedAt': now,
                  ...(typeof receivedOnline === 'boolean'
                    ? { ':receivedOnline': receivedOnline }
                    : {}),
                  ...(typeof receivedOffline === 'boolean'
                    ? { ':receivedOffline': receivedOffline }
                    : {}),
                },
                ConditionExpression: 'attribute_exists(PK)',
              },
            },
          ],
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error during bill update';
      logError('billing_update_failed', { visitId, error: message });
      throw new BillingRuleViolationError('Unable to update bill');
    }

    logInfo('billing_update_success', {
      visitId,
      patientId: visit.patientId,
      total,
      billNo: existingBill.billNo,
      receivedOnline: updatedBill.receivedOnline ?? false,
      receivedOffline: updatedBill.receivedOffline ?? false,
    });

    return updatedBill;
  }

  async getByVisitId(visitId: VisitId): Promise<Billing | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildBillingKey(visitId),
        ConsistentRead: true,
      }),
    );

    const entityType = (Item as { entityType?: unknown } | undefined)?.entityType;
    if (!Item || entityType !== 'BILLING') {
      return null;
    }

    const visit = (await visitRepository.getById(visitId)) as Visit | null;
    if (!visit) {
      return null;
    }

    const patient = await patientRepository.getById(visit.patientId);
    // keep old behavior here; this is only for reading a bill
    if (!patient) {
      return null;
    }

    return Item as Billing;
  }
}

export const billingRepository: BillingRepository = new DynamoDBBillingRepository();
