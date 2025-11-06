jest.mock('../../db/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

jest.mock('../../middleware/auth', () => ({
    __esModule: true,
    isAuthenticated: (req: any, res: any, next: any) => {
        const marker = req.headers['x-test-user'] || req.headers['authorization'];
        if (marker === 'test-user') {
            req.user = { id: 3 };
            return next();
        }
        return res.status(401).json({ message: 'Unauthorized' });
    }
}));

import request from 'supertest';
import app from '../../app';
import poolDefault from '../../db/db';

const pool = poolDefault as unknown as { query: jest.Mock };

describe('Tag routes - integration tests (supertest) with mocked DB', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('GET /api/v1/tags/all-tags -> 200 and returns tags (authenticated)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'tag1', approved: true }] });

        const res = await request(app).get('/api/v1/tags/all-tags').set('x-test-user', 'test-user');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(
            expect.objectContaining({
                message: 'Tag fetched successfully',
                tags: expect.any(Array)
            })
        );
        expect(res.body.tags[0]).toMatchObject({ id: 1, name: 'tag1' });
        expect(pool.query).toHaveBeenCalledWith("SELECT * FROM tags WHERE approved = TRUE");
    });

    it('GET /api/v1/tags/all-tags -> 401 when not authenticated', async () => {
        const res = await request(app).get('/api/v1/tags/all-tags');

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'Unauthorized' });
        expect(pool.query).not.toHaveBeenCalled();
    });
});