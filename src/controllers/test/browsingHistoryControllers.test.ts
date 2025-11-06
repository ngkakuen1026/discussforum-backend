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

describe('Browsing History routes - integration tests (supertest) with mocked DB', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('GET /api/v1/browsing-history/me (View own browsing histories) -> 200 and list of browsing history', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                {
                    post_id: 1,
                    title: "First Post Ever",
                    upvotes: 2,
                    downvote: 1,
                    category: "CREATIVITY",
                    username: "user1",
                    created_at: new Date().toISOString()
                },
                {
                    post_id: 2,
                    title: "Another Interesting Post",
                    upvotes: 5,
                    downvote: 0,
                    category: "TECHNOLOGY",
                    username: "user2",
                    created_at: new Date().toISOString()
                }
            ]
        });

        const res = await request(app)
            .get('/api/v1/browsing-history/browsing-history/me')
            .set('x-test-user', 'test-user');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({ browsingHistory: expect.any(Array) }));
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("browsing_history bh"), [3]);
    });

    it('GET /api/v1/browsing-history/me (View own browsing histories) -> 401 when not authenticated', async () => {
        const res = await request(app).get('/api/v1/browsing-history/browsing-history/me');
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'Unauthorized' });
    });

    it('DELETE /api/v1/browsing-history/me (Delete own browsing histories) -> 200 when deleting multiple histories', async () => {
        pool.query.mockResolvedValueOnce({ rowCount: 2 });
        const res = await request(app)
            .delete('/api/v1/browsing-history/browsing-history/me')
            .set('x-test-user', 'test-user')
            .send({ postIds: [1, 2] });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: "Browsing history deleted", deletedCount: 2 });
        expect(pool.query).toHaveBeenCalledWith(
            "DELETE FROM browsing_history WHERE user_id = $1 AND post_id = ANY($2::int[])",
            [3, [1, 2]]
        );
    });

    it('DELETE /api/v1/browsing-history/me (Delete own browsing histories) -> 400 when postIds missing and invalid', async () => {
        const res = await request(app)
            .delete('/api/v1/browsing-history/browsing-history/me')
            .set('x-test-user', 'test-user')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: "Invalid post IDs" });
    });

    it('DELETE /api/v1/browsing-history/me (Delete own browsing histories) -> 401 when not authenticated', async () => {
        const res = await request(app)
            .delete('/api/v1/browsing-history/browsing-history/me')
            .send({ postIds: [1, 2] });
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'Unauthorized' });
    });
});