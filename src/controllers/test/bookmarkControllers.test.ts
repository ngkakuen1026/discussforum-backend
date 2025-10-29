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

describe('Bookmark routes - integration tests (supertest) with mocked DB', () => {
    it('GET /api/v1/bookmarks/me (View own bookmarks) -> 200 and list of bookmarks', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                {
                    bookmark_id: 1,
                    post_id: 1,
                    post_title: 'Post 1',
                    author_name: 'Author 1',
                    upvotes: 5,
                    downvotes: 2,
                    category_name: 'Category 1',
                    post_created_at: new Date().toISOString()
                },
                {
                    bookmark_id: 2,
                    post_id: 2,
                    post_title: 'Post 2',
                    author_name: 'Author 2',
                    upvotes: 3,
                    downvotes: 1,
                    category_name: 'Category 2',
                    post_created_at: new Date().toISOString()
                }
            ]
        });

        const res = await request(app)
            .get('/api/v1/bookmarks/me')
            .set('x-test-user', 'test-user');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({ bookmarks: expect.any(Array) }));
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("bookmarks b"), [3]);
    });

    it('GET /api/v1/bookmarks/me (View own bookmarks) -> 401 when not authenticated', async () => {
        const res = await request(app).get('/api/v1/bookmarks/me');
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'Unauthorized' });
    });

    it('POST /api/v1/bookmarks/bookmark (Add new bookmark) -> 400 when postId missing', async () => {
        const res = await request(app)
            .post('/api/v1/bookmarks/bookmark')
            .set('x-test-user', 'test-user')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Post ID is required.' });
    });

    it('POST /api/v1/bookmarks/bookmark (Add new bookmark) -> 200 when bookmark added', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [] }) // check existing
            .mockResolvedValueOnce({}); // insert

        const res = await request(app)
            .post('/api/v1/bookmarks/bookmark')
            .set('x-test-user', 'test-user')
            .send({ postId: 10 });
        expect(res.status).toBe(201);
        expect(res.body).toEqual({ message: 'Post 10 bookmarked successfully.' });
        expect(pool.query).toHaveBeenNthCalledWith(1, "SELECT * FROM bookmarks WHERE user_id = $1 AND post_id = $2", [3, 10]);
        expect(pool.query).toHaveBeenNthCalledWith(2, "INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2)", [3, 10]);
    });

    it('POST /api/v1/bookmarks/bookmark (Add new bookmark) -> 400 when post already bookmarked', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 3, post_id: 10 }] }); // existing

        const res = await request(app)
            .post('/api/v1/bookmarks/bookmark')
            .set('x-test-user', 'test-user')
            .send({ postId: 10 });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Post already bookmarked.' });
        expect(pool.query).toHaveBeenCalledWith("SELECT * FROM bookmarks WHERE user_id = $1 AND post_id = $2", [3, 10]);
    });

    it('DELETE /api/v1/bookmarks/bookmark/:postId (Delete own bookmark) -> 200 when bookmark removed', async () => {
        pool.query.mockResolvedValueOnce({ rowCount: 1 }); // delete

        const res = await request(app)
            .delete('/api/v1/bookmarks/bookmark/10')
            .set('x-test-user', 'test-user');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: 'Post 10 removed from bookmark successfully.' });
        expect(pool.query).toHaveBeenCalledWith("DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2", [3, 10]);
    });

    it('DELETE /api/v1/bookmarks/bookmark/:postId (Delete own bookmark) -> 404 when bookmark not found', async () => {
        pool.query.mockResolvedValueOnce({ rowCount: 0 }); // delete

        const res = await request(app)
            .delete('/api/v1/bookmarks/bookmark/10')
            .set('x-test-user', 'test-user');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: 'Post not found in bookmark.' });
        expect(pool.query).toHaveBeenCalledWith("DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2", [3, 10]);
    });

    it('DELETE /api/v1/bookmarks/bookmark/:postId (Delete own bookmark) -> 400 when postId invalid', async () => {
        const res = await request(app)
            .delete('/api/v1/bookmarks/bookmark/abc')
            .set('x-test-user', 'test-user');
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Post ID is required.' });
    });
});