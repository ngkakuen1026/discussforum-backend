jest.mock('../../db/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import request from 'supertest';
import app from '../../app';
import poolDefault from '../../db/db';

const pool = poolDefault as unknown as { query: jest.Mock };

describe('Parent category routes - integration tests (supertest) with mocked DB', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('GET /api/v1/parent-categories/all-parent-categories (Get all parent categories) -> 200 and list of parent categories', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { id: 1, name: "TECHNOLOGY", parent_id: null },
                { id: 2, name: "PROGRAMMING", parent_id: 1 }
            ]
        });
        const res = await request(app)
            .get('/api/v1/parent-categories/all-parent-categories');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({ parentCategories: expect.any(Array) }));
        expect(pool.query).toHaveBeenCalledWith("SELECT id, name FROM parent_categories ORDER BY id ASC");
    });

    it('GET /api/v1/parent-categories/parent-category/:parentCategoryId (Get specific parent category) -> 200 and category data when category exists', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { id: 1, name: "TECHNOLOGY", parent_id: null }
            ]
        });
        const res = await request(app)
            .get('/api/v1/parent-categories/parent-category/1');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({ parentCategory: expect.objectContaining({ id: 1, name: "TECHNOLOGY" }) }));
        expect(pool.query).toHaveBeenCalledWith("SELECT * FROM parent_categories WHERE id = $1", [1]);
    });

});