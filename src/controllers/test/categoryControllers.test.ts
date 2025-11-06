jest.mock('../../db/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import request from 'supertest';
import app from '../../app';
import poolDefault from '../../db/db';

const pool = poolDefault as unknown as { query: jest.Mock };

describe('Category routes - integration tests (supertest) with mocked DB', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });
    
    it('GET /api/v1/categories/all-categories (Get all categories) -> 200 and list of categories', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { id: 1, name: "TECHNOLOGY", parent_id: null },
                { id: 2, name: "PROGRAMMING", parent_id: 1 }
            ]
        });
        const res = await request(app)
            .get('/api/v1/categories/all-categories');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({ categories: expect.any(Array) }));
        expect(pool.query).toHaveBeenCalledWith("SELECT id, name, parent_id FROM categories ORDER BY id ASC");
    });

    it('GET /api/v1/categories/category/:categoryId (Get specific category) -> 200 and category data when category exists', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { id: 1, name: "TECHNOLOGY", parent_id: null }
            ]
        });
        const res = await request(app)
            .get('/api/v1/categories/category/1');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({ category: expect.objectContaining({ id: 1, name: "TECHNOLOGY" }) }));
        expect(pool.query).toHaveBeenCalledWith("SELECT * FROM categories WHERE id = $1", [1]);
    });

});