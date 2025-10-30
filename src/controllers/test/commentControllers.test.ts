jest.mock('../../db/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));
jest.mock('../../utils/notificationUtils', () => ({ __esModule: true, createNotification: jest.fn() }));
jest.mock('../../utils/extractUserMentions', () => ({ __esModule: true, extractUserMentions: jest.fn() }));
jest.mock('../../utils/dateUtils', () => ({ __esModule: true, formatDate: jest.fn(() => '2025-10-27') }));

// mock attachUserIfExists - sets req.user only when test header 'x-test-user' === 'test-user'
jest.mock('../../middleware/attachUserIfExists', () => ({
    __esModule: true,
    default: (req: any, _res: any, next: any) => {
        const marker = req.headers['x-test-user'] || req.headers['authorization'];
        if (marker === 'test-user') req.user = { id: 1 };
        return next();
    }
}));

// mock isAuthenticated middleware - allows when header 'x-test-user' === 'test-user'
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
import { extractUserMentions } from '../../utils/extractUserMentions';
import { formatDate } from '../../utils/dateUtils';

const pool = poolDefault as unknown as { query: jest.Mock };

describe('Comment routes - integration tests (supertest) with mocked DB', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('GET /api/v1/comments/:postId/all-comments (Get all comment for a post) -> 200 returns comments (public)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'P' }] });
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, content: 'Nice post!' }] });

        const res = await request(app).get('/api/v1/comments/1/all-comments');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({ comments: expect.any(Array) }));
        expect(res.body.comments[0]).toMatchObject({ id: 1, content: 'Nice post!' });
        expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('GET /api/v1/comments/:postId/all-comments (Get all comment for a post) -> 404 when post not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get('/api/v1/comments/99/all-comments');

        expect(res.status).toBe(404);
        expect(res.body).toEqual(expect.objectContaining({ message: 'Post not found' }));
        expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('POST /api/v1/comments/:postId/comment (Create comment) -> 400 when content missing', async () => {
        const res = await request(app)
            .post('/api/v1/comments/1/comment')
            .set('x-test-user', 'test-user')
            .send({ content: '' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Content is required' });
    });

    it('POST /api/v1/comments/:postId/comment (Create comment) -> 404 when post not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // SELECT post -> not found

        const res = await request(app)
            .post('/api/v1/comments/1/comment')
            .set('x-test-user', 'test-user')
            .send({ content: 'Hello' });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: 'Post not found' });
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM posts WHERE id = $1', [1]);
    });

    it('POST /api/v1/comments/:postId/comment (Create comment) -> 201 creates comment and notifies post author (no mentions)', async () => {
        // 1) SELECT post, 2) INSERT comment, 3) SELECT username (commenter)
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 1, title: 'Test Post', user_id: 2 }] }) // postResult
            .mockResolvedValueOnce({ rows: [{ id: 10, content: 'Great post!' }] }) // newComment
            .mockResolvedValueOnce({ rows: [{ username: 'testuser' }] }); // userResult

        (extractUserMentions as jest.Mock).mockReturnValue([]);
        (notificationUtils.createNotification as jest.Mock).mockResolvedValue(undefined);
        (formatDate as jest.Mock).mockReturnValue('2025-10-27');

        const payload = { content: 'Great post!' };
        const res = await request(app)
            .post('/api/v1/comments/1/comment')
            .set('x-test-user', 'test-user')
            .send(payload);

        expect(res.status).toBe(201);
        expect(res.body).toEqual(
            expect.objectContaining({
                message: 'Comment created successfully for post ID 1',
                comment: expect.objectContaining({ id: 10, content: 'Great post!' }),
            })
        );

        // verify DB calls and notification to post author only
        expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM posts WHERE id = $1', [1]);
        expect(pool.query).toHaveBeenNthCalledWith(
            2,
            'INSERT INTO comments (user_id, post_id, content, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
            [3, 1, 'Great post!']
        );
        expect(notificationUtils.createNotification).toHaveBeenCalledWith(2, expect.stringContaining('commented on your post'), 'comment', 1);
    });

    it('POST /api/v1/comments/:postId/comment (Create comment) -> 201 creates comment and notifies mentions', async () => {
        // 1) SELECT post, 2) INSERT comment, 3) SELECT username (commenter), 4) SELECT id for mentioned user
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 1, title: 'Test Post', user_id: 2 }] }) // postResult
            .mockResolvedValueOnce({ rows: [{ id: 11, content: 'Hello @alice' }] }) // newComment
            .mockResolvedValueOnce({ rows: [{ username: 'testuser' }] }) // userResult
            .mockResolvedValueOnce({ rows: [{ id: 33 }] }); // mentioned user id

        (extractUserMentions as jest.Mock).mockReturnValue(['alice']);
        (notificationUtils.createNotification as jest.Mock).mockResolvedValue(undefined);
        (formatDate as jest.Mock).mockReturnValue('2025-10-27');

        const payload = { content: 'Hello @alice' };
        const res = await request(app)
            .post('/api/v1/comments/1/comment')
            .set('x-test-user', 'test-user')
            .send(payload);

        expect(res.status).toBe(201);
        expect(res.body).toEqual(
            expect.objectContaining({
                message: 'Comment created successfully for post ID 1',
                comment: expect.objectContaining({ id: 11, content: 'Hello @alice' }),
            })
        );

        // notification to post author + mention
        expect(notificationUtils.createNotification).toHaveBeenCalledWith(2, expect.stringContaining('commented on your post'), 'comment', 1);
        expect(notificationUtils.createNotification).toHaveBeenCalledWith(33, expect.stringContaining('mentioned you in a comment'), 'mention', 11);

        // ensure SELECT id FROM users WHERE username called for mention
        expect(pool.query).toHaveBeenCalledWith('SELECT id FROM users WHERE username = $1', ['alice']);
    });

    it('POST /api/v1/comments/:commentId/reply (Reply to comment) -> 400 when content missing', async () => {
        const res = await request(app)
            .post('/api/v1/comments/8/reply')
            .set('x-test-user', 'test-user')
            .send({ content: '' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Content is required' });
    });

    it('POST /api/v1/comments/:commentId/reply (Reply to comment) -> 404 when comment not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // SELECT comment -> not found

        const res = await request(app)
            .post('/api/v1/comments/8/reply')
            .set('x-test-user', 'test-user')
            .send({ content: 'ok' });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: 'Comment not found' });
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM comments WHERE id = $1', [8]);
    });

    it('POST /api/v1/comments/:commentId/reply (Reply to comment) -> 201 creates reply and notifies original author + mentions', async () => {
        // 1) SELECT comment, 2) INSERT reply, 3) SELECT username (replier), 4) SELECT title, 5) SELECT id for mentioned user
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 20, post_id: 9, user_id: 11 }] }) // commentResult
            .mockResolvedValueOnce({ rows: [{ id: 200, content: 'reply' }] }) // newReply
            .mockResolvedValueOnce({ rows: [{ username: 'replyer' }] }) // userResult
            .mockResolvedValueOnce({ rows: [{ title: 'PostTitle' }] }) // titleResult
            .mockResolvedValueOnce({ rows: [{ id: 44 }] }); // mentioned user id

        (extractUserMentions as jest.Mock).mockReturnValue(['bob']);
        (notificationUtils.createNotification as jest.Mock).mockResolvedValue(undefined);
        (formatDate as jest.Mock).mockReturnValue('2025-10-27');

        const payload = { content: 'hi @bob' };
        const res = await request(app)
            .post('/api/v1/comments/20/reply')
            .set('x-test-user', 'test-user')
            .send(payload);

        expect(res.status).toBe(201);
        expect(res.body).toEqual(
            expect.objectContaining({
                message: 'Reply created successfully for comment ID 20',
                reply: expect.objectContaining({ id: 200, content: 'reply' }),
            })
        );

        expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM comments WHERE id = $1', [20]);
        expect(pool.query).toHaveBeenNthCalledWith(
            2,
            'INSERT INTO comments (user_id, post_id, content, created_at, parent_comment_id) VALUES ($1, $2, $3, NOW(), $4) RETURNING *',
            [3, 9, 'hi @bob', 20]
        );

        expect(notificationUtils.createNotification).toHaveBeenCalledWith(11, expect.stringContaining('replied to your comment'), 'comment_reply', 20);
        expect(notificationUtils.createNotification).toHaveBeenCalledWith(44, expect.stringContaining('mentioned you in a reply'), 'mention', 200);

        expect(pool.query).toHaveBeenCalledWith('SELECT id FROM users WHERE username = $1', ['bob']);
    });

    it('POST /api/v1/comments/:commentId/reply (Reply to comment) -> 201 when mentioned user not found (only original author notified)', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 21, post_id: 10, user_id: 12 }] }) // commentResult
            .mockResolvedValueOnce({ rows: [{ id: 201, content: 'hey @nobody' }] }) // newReply
            .mockResolvedValueOnce({ rows: [{ username: 'replyer' }] }) // userResult
            .mockResolvedValueOnce({ rows: [{ title: 'PostTitle' }] }) // titleResult
            .mockResolvedValueOnce({ rows: [] }); // mention lookup returns none

        (extractUserMentions as jest.Mock).mockReturnValue(['nobody']);
        (notificationUtils.createNotification as jest.Mock).mockResolvedValue(undefined);

        const res = await request(app)
            .post('/api/v1/comments/21/reply')
            .set('x-test-user', 'test-user')
            .send({ content: 'hey @nobody' });

        expect(res.status).toBe(201);
        // only original comment author notified
        expect(notificationUtils.createNotification).toHaveBeenCalledTimes(1);
        expect(notificationUtils.createNotification).toHaveBeenCalledWith(12, expect.any(String), 'comment_reply', 21);
    });
});