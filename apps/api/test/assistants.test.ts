import { beforeAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { warmAuth, asDoctor, asReception, asAdmin } from './helpers/auth';

const app = createApp();

beforeAll(async () => {
  await warmAuth();
});

describe('Assistants API', () => {
  it('doctor can list assistants', async () => {
    const res = await request(app).get('/assistants').set('Authorization', asDoctor()).expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('reception can create assistant, doctor can see it', async () => {
    const created = await request(app)
      .post('/assistants')
      .set('Authorization', asReception())
      .send({ name: 'Asha', active: true })
      .expect(201);

    expect(created.body.assistantId).toBeTruthy();
    expect(created.body.name).toBe('Asha');

    const list = await request(app).get('/assistants').set('Authorization', asDoctor()).expect(200);

    const found = list.body.items.find((x: any) => x.assistantId === created.body.assistantId);
    expect(found).toBeDefined();
  });

  it('reception can deactivate assistant', async () => {
    const created = await request(app)
      .post('/assistants')
      .set('Authorization', asReception())
      .send({ name: 'Inactive Test', active: true })
      .expect(201);

    const updated = await request(app)
      .patch(`/assistants/${created.body.assistantId}`)
      .set('Authorization', asReception())
      .send({ active: false })
      .expect(200);

    expect(updated.body.active).toBe(false);
  });

  it('doctor cannot create assistant', async () => {
    await request(app)
      .post('/assistants')
      .set('Authorization', asDoctor())
      .send({ name: 'Nope' })
      .expect(403);
  });

  it('admin can update assistant name', async () => {
    const created = await request(app)
      .post('/assistants')
      .set('Authorization', asReception())
      .send({ name: 'RenameMe', active: true })
      .expect(201);

    const updated = await request(app)
      .patch(`/assistants/${created.body.assistantId}`)
      .set('Authorization', asAdmin())
      .send({ name: 'Renamed' })
      .expect(200);

    expect(updated.body.name).toBe('Renamed');
  });
});
