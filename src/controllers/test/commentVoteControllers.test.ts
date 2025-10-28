jest.mock('../../db/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));
jest.mock('../../utils/notificationUtils', () => ({ __esModule: true, createNotification: jest.fn() }));

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
import * as notificationUtils from '../../utils/notificationUtils';

const pool = poolDefault as unknown as { query: jest.Mock };

describe('Comment vote routes - integration tests (supertest) with mocked DB', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('GET /api/v1/comments/votes/:commentId (View comment vote) -> 404 when comment not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get('/api/v1/comments/votes/5');

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: "Comment not found" });
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM comments WHERE id = $1', [5]);
    });

    it('GET /api/v1/comments/votes/:commentId (View comment vote) -> 200 returns grouped votes when comment exists', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 5 }] })
            .mockResolvedValueOnce({ rows: [{ vote_type: 1, count: '2' }, { vote_type: -1, count: '1' }] });

        const res = await request(app).get('/api/v1/comments/votes/5');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ votes: [{ vote_type: 1, count: '2' }, { vote_type: -1, count: '1' }] });
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM comments WHERE id = $1', [5]);
        expect(pool.query).toHaveBeenCalledWith('SELECT vote_type, COUNT(*) as count FROM comment_votes WHERE comment_id = $1 GROUP BY vote_type', [5]);
    });

    it('POST /api/v1/comments/votes/:commentId (Vote comment (upvote, like)) -> 200 records vote (authenticated) and notifies comment owner', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 10, post_id: 20, user_id: 99, content: 'This is a comment.' }] })
            .mockResolvedValueOnce({ rows: [] }) 
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [{ title: 'Post Title' }] })
            .mockResolvedValueOnce({ rows: [{ username: 'voter' }] });

        (notificationUtils.createNotification as jest.Mock).mockResolvedValue(undefined);

        const res = await request(app)
            .post('/api/v1/comments/votes/10')
            .set('x-test-user', 'test-user')
            .send({ voteType: 1 });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: 'Vote recorded successfully.' });

        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM comments WHERE id = $1', [10]);
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM comment_votes WHERE comment_id = $1 AND user_id = $2', [10, 3]);
        expect(pool.query).toHaveBeenCalledWith('INSERT INTO comment_votes (comment_id, user_id, vote_type) VALUES ($1, $2, $3)', [10, 3, 1]);
        expect(pool.query).toHaveBeenCalledWith('SELECT title FROM posts WHERE id = $1', [20]);
        expect(pool.query).toHaveBeenCalledWith('SELECT username FROM users WHERE id = $1', [3]);
        expect(notificationUtils.createNotification).toHaveBeenCalledWith(99, expect.stringContaining('User voter liked your comment: This is a comment. on post \Post Title\.'), 'like', 10);
    });

    it('POST /api/v1/comments/votes/:commentId (Vote comment (downvote, dislike)) -> 200 records vote (authenticated) and notifies comment owner', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 10, post_id: 20, user_id: 99, content: 'This is a comment.' }] })
            .mockResolvedValueOnce({ rows: [] }) 
            .mockResolvedValueOnce({ rowCount: 1 }) 
            .mockResolvedValueOnce({ rows: [{ title: 'Post Title' }] }) 
            .mockResolvedValueOnce({ rows: [{ username: 'voter' }] }); 

        (notificationUtils.createNotification as jest.Mock).mockResolvedValue(undefined);

        const res = await request(app)
            .post('/api/v1/comments/votes/10')
            .set('x-test-user', 'test-user')
            .send({ voteType: -1 });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: 'Vote recorded successfully.' });

        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM comments WHERE id = $1', [10]);
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM comment_votes WHERE comment_id = $1 AND user_id = $2', [10, 3]);
        expect(pool.query).toHaveBeenCalledWith('INSERT INTO comment_votes (comment_id, user_id, vote_type) VALUES ($1, $2, $3)', [10, 3, -1]);
        expect(pool.query).toHaveBeenCalledWith('SELECT title FROM posts WHERE id = $1', [20]);
        expect(pool.query).toHaveBeenCalledWith('SELECT username FROM users WHERE id = $1', [3]);
        expect(notificationUtils.createNotification).toHaveBeenCalledWith(99, expect.stringContaining('User voter disliked your comment: This is a comment. on post \Post Title\.'), 'dislike', 10);
    });

    it('POST /api/v1/comments/votes/:commentId (Vote comment) -> 403 when user already voted', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 20, post_id: 30, user_id: 50 }] }) 
            .mockResolvedValueOnce({ rows: [{ id: 1, vote_type: 1, user_id: 3 }] }); 
        const res = await request(app)
            .post('/api/v1/comments/votes/20')
            .set('x-test-user', 'test-user')
            .send({ voteType: -1 });
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ message: 'You have already voted on this comment. You cannot change your vote.' });
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM comments WHERE id = $1', [20]);
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM comment_votes WHERE comment_id = $1 AND user_id = $2', [20, 3]);
    });

    it('POST /api/v1/comments/votes/:commentId (Vote comment) -> 400 for invalid vote type', async () => {
        const res = await request(app)
            .post('/api/v1/comments/votes/10')
            .set('x-test-user', 'test-user')
            .send({ voteType: 'upvote' });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Invalid vote type. Use 1 for upvote and -1 for downvote.' });
    });
});