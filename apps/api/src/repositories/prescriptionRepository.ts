import { randomUUID } from 'node:crypto';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import type { Visit, Prescription, RxId, RxLineType } from '@dms/types';

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const buildVisitRxKey = (visitId: string, rxId: string) => ({
  PK: `VISIT#${visitId}`,
  SK: `RX#${rxId}`,
});

const buildRxMetaKey = (rxId: string) => ({
  PK: `RX#${rxId}`,
  SK: 'META',
});

const buildVisitMetaKey = (visitId: string) => ({
  PK: `VISIT#${visitId}`,
  SK: 'META',
});

export interface PrescriptionRepository {
  /** Draft flow: one current rx per visit (same rxId) */
  upsertDraftForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
  }): Promise<Prescription>;

  /** Explicit revision after DONE: creates new rxId with version = max+1 and updates visit pointer */
  createNewVersionForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
  }): Promise<Prescription>;

  /** Update an existing rxId (used after revision starts) */
  updateById(params: {
    rxId: RxId;
    lines: RxLineType[];
    jsonKey: string;
  }): Promise<Prescription | null>;

  getById(rxId: RxId): Promise<Prescription | null>;
  listByVisit(visitId: string): Promise<Prescription[]>;
  getCurrentForVisit(visitId: string): Promise<Prescription | null>;
}

export class DynamoDBPrescriptionRepository implements PrescriptionRepository {
  async getById(rxId: RxId): Promise<Prescription | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildRxMetaKey(rxId),
        ConsistentRead: true,
      }),
    );
    if (!Item || Item.entityType !== 'RX') return null;
    return Item as Prescription;
  }

  async listByVisit(visitId: string): Promise<Prescription[]> {
    const { Items } = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `VISIT#${visitId}`,
          ':skPrefix': 'RX#',
        },
        ScanIndexForward: true,
      }),
    );

    if (!Items || Items.length === 0) return [];
    const prescriptions = Items as Prescription[];
    return prescriptions.slice().sort((a, b) => a.version - b.version);
  }

  async getCurrentForVisit(visitId: string): Promise<Prescription | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildVisitMetaKey(visitId),
        ConsistentRead: true,
      }),
    );

    if (!Item || Item.entityType !== 'VISIT') return null;
    const currentRxId = (Item as any).currentRxId as string | undefined;
    if (!currentRxId) return null;

    return this.getById(currentRxId);
  }

  /** Draft: create once (v1) and keep updating same rxId */
  async upsertDraftForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
  }): Promise<Prescription> {
    const { visit, lines, jsonKey } = params;

    // Read visit meta to see if we already have a current Rx pointer
    const { Item: visitMeta } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildVisitMetaKey(visit.visitId),
        ConsistentRead: true,
      }),
    );

    const currentRxId = (visitMeta as any)?.currentRxId as string | undefined;

    // If exists, just update same rxId (no new version)
    if (currentRxId) {
      const updated = await this.updateById({ rxId: currentRxId, lines, jsonKey });
      if (updated) return updated;
      // If pointer is stale (shouldn't happen), fall through to create
    }

    // Create initial draft v1
    const now = Date.now();
    const rxId = randomUUID();
    const version = 1;

    const base: Prescription = {
      rxId,
      visitId: visit.visitId,
      doctorId: visit.doctorId,
      lines,
      version,
      jsonKey,
      createdAt: now,
      updatedAt: now,
    };

    const visitScopedItem = {
      ...buildVisitRxKey(visit.visitId, rxId),
      entityType: 'RX',
      patientId: visit.patientId,
      visitDate: visit.visitDate,
      ...base,
    };

    const rxMetaItem = {
      ...buildRxMetaKey(rxId),
      entityType: 'RX',
      patientId: visit.patientId,
      visitDate: visit.visitDate,
      ...base,
    };

    // Transaction: create RX + set visit pointer iff not already set
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: visitScopedItem,
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: rxMetaItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildVisitMetaKey(visit.visitId),
              UpdateExpression: 'SET #currentRxId = :rxId, #currentRxVersion = :v, #updatedAt = :u',
              ExpressionAttributeNames: {
                '#currentRxId': 'currentRxId',
                '#currentRxVersion': 'currentRxVersion',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':rxId': rxId,
                ':v': version,
                ':u': now,
              },
              // ✅ Only set pointer if not already present
              ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(#currentRxId)',
            },
          },
        ],
      }),
    );

    return base;
  }

  /** Revision: compute next version, create new rxId, update visit pointer (always overwrites pointer) */
  async createNewVersionForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
  }): Promise<Prescription> {
    const { visit, lines, jsonKey } = params;

    // Determine next version by scanning visit scoped RX items
    const existing = await this.listByVisit(visit.visitId);
    const maxVersion = existing.reduce((m, p) => (p.version > m ? p.version : m), 0);
    const version = maxVersion + 1;

    const now = Date.now();
    const rxId = randomUUID();

    const base: Prescription = {
      rxId,
      visitId: visit.visitId,
      doctorId: visit.doctorId,
      lines,
      version,
      jsonKey,
      createdAt: now,
      updatedAt: now,
    };

    const visitScopedItem = {
      ...buildVisitRxKey(visit.visitId, rxId),
      entityType: 'RX',
      patientId: visit.patientId,
      visitDate: visit.visitDate,
      ...base,
    };

    const rxMetaItem = {
      ...buildRxMetaKey(rxId),
      entityType: 'RX',
      patientId: visit.patientId,
      visitDate: visit.visitDate,
      ...base,
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: TABLE_NAME, Item: visitScopedItem } },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: rxMetaItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildVisitMetaKey(visit.visitId),
              UpdateExpression: 'SET #currentRxId = :rxId, #currentRxVersion = :v, #updatedAt = :u',
              ExpressionAttributeNames: {
                '#currentRxId': 'currentRxId',
                '#currentRxVersion': 'currentRxVersion',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':rxId': rxId,
                ':v': version,
                ':u': now,
              },
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
        ],
      }),
    );

    return base;
  }

  async updateById(params: {
    rxId: RxId;
    lines: RxLineType[];
    jsonKey: string;
  }): Promise<Prescription | null> {
    const { rxId, lines, jsonKey } = params;
    const existing = await this.getById(rxId);
    if (!existing) return null;

    const now = Date.now();
    const next: Prescription = {
      ...existing,
      lines,
      jsonKey,
      updatedAt: now,
    };

    // Update BOTH items: RX meta + VISIT scoped RX
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildRxMetaKey(rxId),
              UpdateExpression: 'SET #lines = :l, #jsonKey = :j, #updatedAt = :u',
              ExpressionAttributeNames: {
                '#lines': 'lines',
                '#jsonKey': 'jsonKey',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':l': lines,
                ':j': jsonKey,
                ':u': now,
              },
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildVisitRxKey(existing.visitId, rxId),
              UpdateExpression: 'SET #lines = :l, #jsonKey = :j, #updatedAt = :u',
              ExpressionAttributeNames: {
                '#lines': 'lines',
                '#jsonKey': 'jsonKey',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':l': lines,
                ':j': jsonKey,
                ':u': now,
              },
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
        ],
      }),
    );

    return next;
  }
}

export const prescriptionRepository: PrescriptionRepository = new DynamoDBPrescriptionRepository();
